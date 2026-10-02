import { BrowserWindow } from "electron";
import {
  buildPrefix,
  buildSuffix,
  cacheIsValid,
  evaluateCondition,
  findModel,
  isWorthShowing,
  questionsOf,
  schedule,
  windowAround,
  type Analysis,
  type AppConfig,
  type EngineState,
  type RecordView,
  type RenderedRecord,
  type TargetedQuestion,
} from "@core";
import { IPC_EVENT } from "@core/ipc";
import { InferenceEngine } from "./engine";
import { modelLog } from "./model-log";
import { isModelPresent, modelPath } from "./model-store";

/**
 * Running the model over records, ahead of the labeler.
 *
 * Owns the queue, the per-record cache and the engine. Pushes results to the
 * renderer as they land rather than answering requests, because the whole point
 * is that the answer is usually already there by the time anyone asks.
 *
 * Nothing here is reachable from the export path.
 */

interface Loaded {
  config: AppConfig;
  records: readonly RecordView[];
  /**
   * Every question this file could be asked, built once.
   *
   * Built-ins first, then the config's. Order matters only for display, but the
   * loader has already refused a config whose question id collides with a
   * built-in, so neither can displace the other.
   */
  questions: readonly TargetedQuestion[];
  prefix: string;
  modelId: string;
}

let current: Loaded | null = null;
let index = 0;
const cache = new Map<number, Analysis>();
let running: number | null = null;
let state: EngineState = { kind: "no-model" };

const broadcast = (channel: string, payload: unknown): void => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
};

const setState = (next: EngineState): void => {
  state = next;
  broadcast(IPC_EVENT.aiStatus, state);
};

export const aiState = (): EngineState => state;

const engine = new InferenceEngine({
  onLoaded: () => {
    if (current) setState({ kind: "ready", modelId: current.modelId });
    pump();
  },
  onLoadFailed: (error) => setState({ kind: "error", message: error }),
  onExit: () => {
    // A worker that died mid-record leaves that record unanswered; the next
    // scheduling pass reloads and picks it up rather than stalling silently.
    running = null;
    if (state.kind === "ready") setState({ kind: "no-model" });
  },
});

/** Every cached result, for a renderer that has just opened. */
export const cachedAnalyses = (): Analysis[] => [...cache.values()];

/**
 * Point the service at a file.
 *
 * Clears the cache: an answer is about one record in one file, and a stale one
 * shown against a different row would be worse than none.
 */
export function setInput(
  config: AppConfig | null,
  records: readonly RecordView[],
  modelId: string,
): void {
  cache.clear();
  running = null;
  engine.cancel();

  if (!config) {
    current = null;
    return;
  }
  current = {
    config,
    records,
    questions: questionsOf(config),
    prefix: buildPrefix(config.input.fields, config.ai.context),
    modelId,
  };
  index = 0;
  void pump();
}

/** Tell the service where the labeler is; it decides what that changes. */
export function setIndex(next: number): void {
  index = next;
  void pump();
}

/** Stop everything and release the model. */
export function shutdownAi(): void {
  engine.stop();
  cache.clear();
  running = null;
}

function publish(analysis: Analysis): void {
  cache.set(analysis.recordIndex, analysis);
  broadcast(IPC_EVENT.aiAnalysis, analysis);
}

/**
 * The questions worth asking about this record.
 *
 * A `when` that does not hold means the question is never encoded at all, which
 * is the cheapest kind of speed: the author has told us it cannot apply here.
 */
const questionsFor = (loaded: Loaded, record: RecordView): TargetedQuestion[] =>
  loaded.questions.filter(
    (question) =>
      question.when === undefined || evaluateCondition(question.when, record.inputValues),
  );

/** The record under review and its neighbours, in file order. */
const windowFor = (loaded: Loaded, target: number): RenderedRecord[] =>
  windowAround(target, loaded.records.length, loaded.config.ai.neighbours).flatMap(
    (i): RenderedRecord[] => {
      const record = loaded.records[i];
      // Only input values travel. A neighbour's label is deliberately withheld,
      // so the model reads the data rather than agreeing with recent answers.
      return record
        ? [{ values: record.inputValues, ...(i === target ? { current: true } : {}) }]
        : [];
    },
  );

/**
 * Do whatever the current state says should happen next.
 *
 * Called on every change — the labeler moved, a record finished, the model
 * loaded. The decision itself is `schedule`, which is pure and tested; this
 * function only carries it out.
 */
async function pump(): Promise<void> {
  const loaded = current;
  if (!loaded) return;

  const spec = findModel(loaded.modelId);
  if (!spec) return;

  const done = new Set(
    [...cache.entries()]
      .filter(([, analysis]) => cacheIsValid(analysis.modelId, loaded.modelId))
      .filter(([, analysis]) => analysis.status !== "queued" && analysis.status !== "running")
      .map(([recordIndex]) => recordIndex),
  );

  const plan = schedule({ index, count: loaded.records.length, done, running });
  if (plan.abandonRunning) {
    engine.cancel();
    running = null;
  }
  if (plan.start === null) return;

  if (!(await isModelPresent(spec))) {
    setState({ kind: "no-model" });
    return;
  }
  if (!engine.isLoaded) {
    setState({ kind: "loading", modelId: loaded.modelId });
    // The temperature travels with the path: it is fitted for this exact file,
    // and reading another file at it would be miscalibrated rather than slow.
    engine.load(modelPath(spec), spec.decision.temperature);
    return;
  }

  const target = plan.start;
  const record = loaded.records[target];
  if (!record) return;

  running = target;
  publish({ recordIndex: target, status: "running", answers: [], modelId: loaded.modelId });

  const questions = questionsFor(loaded, record);
  const suffix = buildSuffix(loaded.config.input.fields, windowFor(loaded, target));

  // Logged before the decode rather than after, so a call that hangs or takes
  // the worker down with it still leaves a trace of what was asked. A call that
  // only appears once it succeeds is a log that cannot explain a failure.
  const logged = modelLog.record({
    recordIndex: target,
    modelId: loaded.modelId,
    status: "running",
    prefix: loaded.prefix,
    suffix,
    answers: [],
  });

  const startedAt = Date.now();
  try {
    const answers = await engine.ask(loaded.prefix, suffix, questions);
    const byId = new Map(questions.map((question) => [question.id, question]));
    // "Findings" means at least one answer crossed its own threshold. Nothing is
    // inferred from the shape of a reply any more: every question gets an answer,
    // so "clean" is a statement about the probabilities rather than a guess about
    // what a truncated response might have meant.
    const notable = answers.some((answer) =>
      isWorthShowing(answer, byId.get(answer.id)?.showAbove),
    );
    const status = notable ? "findings" : "clean";
    const elapsedMs = Date.now() - startedAt;
    publish({ recordIndex: target, status, answers, modelId: loaded.modelId, elapsedMs });
    modelLog.update(logged.id, { status, elapsedMs, answers });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Analysis failed.";
    publish({
      recordIndex: target,
      status: "failed",
      answers: [],
      modelId: loaded.modelId,
      error,
    });
    modelLog.update(logged.id, { status: "failed", elapsedMs: Date.now() - startedAt, error });
  } finally {
    if (running === target) running = null;
  }

  void pump();
}
