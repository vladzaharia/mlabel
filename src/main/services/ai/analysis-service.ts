import { BrowserWindow } from "electron";
import {
  buildOutputJsonSchema,
  buildPrefix,
  buildSuffix,
  recordBudget,
  cacheIsValid,
  findModel,
  parseModelOutput,
  schedule,
  type Analysis,
  type AppConfig,
  type EngineState,
  type RecordView,
  type Scopes,
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
  scopes: Scopes;
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
 * Clears the cache: findings are about one record in one file, and a stale one
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
  const scopes: Scopes = {
    fields: config.input.fields.map((f) => f.name),
    cards: (config.input.cards ?? []).map((c) => c.name),
  };
  current = {
    config,
    records,
    scopes,
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
    engine.load(modelPath(spec), buildOutputJsonSchema(loaded.scopes));
    return;
  }

  const target = plan.start;
  const record = loaded.records[target];
  if (!record) return;

  running = target;
  publish({ recordIndex: target, status: "running", findings: [], modelId: loaded.modelId });

  // The prefix and the record share one context window, so what the record may
  // spend depends on what the instructions already cost. Computed from the
  // prefix that was actually built, not assumed.
  const suffix = buildSuffix(
    loaded.config.input.fields,
    record.inputValues,
    recordBudget(loaded.prefix),
  );
  // Logged before the decode rather than after, so a call that hangs or takes
  // the worker down with it still leaves a trace of what was asked. A call that
  // only appears once it succeeds is a log that cannot explain a failure.
  const logged = modelLog.record({
    recordIndex: target,
    modelId: loaded.modelId,
    status: "running",
    prefix: loaded.prefix,
    suffix,
    findings: [],
  });

  const startedAt = Date.now();
  try {
    const json = await engine.analyze(loaded.prefix, suffix);
    const parsed = parseModelOutput(json, loaded.scopes);
    const status = parsed.ok ? (parsed.findings.length > 0 ? "findings" : "clean") : "failed";
    const elapsedMs = Date.now() - startedAt;
    publish({
      recordIndex: target,
      status,
      findings: parsed.findings,
      modelId: loaded.modelId,
      elapsedMs,
      ...(parsed.error === undefined ? {} : { error: parsed.error }),
    });
    modelLog.update(logged.id, {
      status,
      elapsedMs,
      raw: json,
      findings: parsed.findings,
      ...(parsed.error === undefined ? {} : { error: parsed.error }),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Analysis failed.";
    publish({
      recordIndex: target,
      status: "failed",
      findings: [],
      modelId: loaded.modelId,
      error,
    });
    modelLog.update(logged.id, { status: "failed", elapsedMs: Date.now() - startedAt, error });
  } finally {
    if (running === target) running = null;
  }

  void pump();
}
