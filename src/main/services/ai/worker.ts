/**
 * The inference process.
 *
 * This is the **only** file in the app that imports `node-llama-cpp`. It runs as
 * an Electron `utilityProcess`, not on the main thread, for three reasons:
 *
 * - a GGML abort or an out-of-memory in native code kills this process rather
 *   than the app;
 * - a decode does not compete with CSV parsing for the libuv threadpool;
 * - unloading ~3 GB of weights is a `kill()` rather than a hopeful `free()`.
 *
 * It speaks one request/response protocol over `process.parentPort` and holds no
 * state the parent cannot rebuild.
 *
 * **Nothing is generated here.** A decision model is asked a question whose
 * answers are declared up front, and the answer is read from the probability
 * distribution over single-letter labels at the next position. So there is no
 * chat session, no chat wrapper, no grammar and no token cap — all of which
 * existed to keep an open-ended text model on the rails.
 */

import {
  LETTERS,
  MAX_LABELS,
  lettersFor,
  readAnswer,
  renderQuestion,
  type Answer,
  type TargetedQuestion,
} from "@core";
import type {
  ControlledEvaluateInputItem,
  LlamaContext,
  LlamaContextSequence,
  LlamaModel,
  Token,
} from "node-llama-cpp";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { assertSingleTokenLabels, labelLogits } from "./readout";

/**
 * Matches the model's validated context.
 *
 * JevK5 is validated to 8192 tokens, and the KV cache is allocated up front from
 * this — a model's native window can be far larger and would want gigabytes
 * before a single record was read. The prompt is budgeted in `prompt.ts` to stay
 * well inside this, because overrunning it triggers a context shift that drops
 * the *beginning* of the prompt — the instructions — and silently changes what
 * was asked.
 */
const CONTEXT_SIZE = 8192;

interface Loaded {
  model: LlamaModel;
  context: LlamaContext;
  sequence: LlamaContextSequence;
  /** Label letter to its single token id, checked at load. */
  labelTokens: Map<string, Token>;
  temperature: number;
}

let loaded: Loaded | null = null;
let inFlight: AbortController | null = null;

const send = (message: WorkerResponse): void => {
  process.parentPort.postMessage(message);
};

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : "Unknown inference error.";

async function load(modelPath: string, temperature: number): Promise<void> {
  const { getLlama } = await import("node-llama-cpp");
  const llama = await getLlama({ build: "never" });
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext({ contextSize: CONTEXT_SIZE });
  const sequence = context.getSequence();

  // Checked once, here, rather than per question. A label that is not a single
  // token scores whatever its first token happens to be and never throws, so
  // every record would come back confidently wrong; this turns that into a
  // startup failure a person can read.
  const letters = LETTERS.slice(0, MAX_LABELS);
  const ids = assertSingleTokenLabels(letters, (text) => model.tokenize(text, false));
  // `Token` is a branded number, and `readout.ts` speaks plain numbers on purpose
  // so it can be tested without loading a native runtime. This is the one place
  // the two meet, so it is the one place the brand is reapplied.
  const labelTokens = new Map<string, Token>(
    letters.map((letter, i) => [letter, ids[i]! as unknown as Token]),
  );

  loaded = { model, context, sequence, labelTokens, temperature };
  send({ type: "loaded" });
}

/**
 * Answer every question about one record.
 *
 * The state is encoded once; each question is then appended, read, and erased
 * back to the state boundary. That is what makes a per-field question nearly
 * free — N questions cost one encode of the record plus N short passes — and it
 * is also why they must all share one state.
 */
async function ask(
  id: number,
  prefix: string,
  suffix: string,
  questions: readonly TargetedQuestion[],
): Promise<void> {
  if (!loaded) {
    send({ type: "failed", id, error: "No model is loaded." });
    return;
  }

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  const { model, sequence, labelTokens, temperature } = loaded;

  try {
    // Cleared per record rather than accumulated: each record is an independent
    // question, and a growing history would both drift and overrun the context.
    await sequence.clearHistory();

    const state = model.tokenize(`${prefix}\n\n${suffix}\n\n`, true);
    await sequence.evaluateWithoutGeneratingNewTokens(state);
    const boundary = sequence.nextTokenIndex;

    const answers: Answer[] = [];
    // Sequential on purpose, and `no-await-in-loop` is disabled below rather than
    // satisfied: every question is evaluated against *the same* sequence and
    // erased before the next one appends. Running them with `Promise.all` would
    // interleave appends and erases over one shared KV state, so questions would
    // read each other's tokens — plausible-looking answers to the wrong prompt.
    for (const question of questions) {
      if (controller.signal.aborted) return;

      const tokens = model.tokenize(`${renderQuestion(question)}\n`, false);
      if (tokens.length === 0) continue;

      // Probabilities are asked for only at the final position: that is where the
      // answer letter would go, and asking at every position would cost the whole
      // vocabulary distribution per token for nothing.
      const input: ControlledEvaluateInputItem[] = tokens.map((token, i) =>
        i === tokens.length - 1 ? [token, { generateNext: { probabilities: true } }] : token,
      );
      // oxlint-disable-next-line no-await-in-loop
      const output = await sequence.controlledEvaluate(input);
      const probabilities = output.at(-1)?.next?.probabilities ?? new Map<Token, number>();

      const ids = lettersFor(question).map((letter) => labelTokens.get(letter) ?? -1);
      answers.push(readAnswer(question, labelLogits(probabilities, ids), temperature));

      // Back to the end of the state, so the next question sees the record and
      // not the previous question.
      // oxlint-disable-next-line no-await-in-loop
      await sequence.eraseContextTokenRanges([{ start: boundary, end: sequence.nextTokenIndex }]);
    }

    if (!controller.signal.aborted) send({ type: "answers", id, answers });
  } catch (err) {
    if (!controller.signal.aborted) send({ type: "failed", id, error: messageOf(err) });
  } finally {
    if (inFlight === controller) inFlight = null;
  }
}

process.parentPort.on("message", (event) => {
  const request = event.data as WorkerRequest;
  switch (request.type) {
    case "load":
      void load(request.modelPath, request.temperature).catch((err: unknown) => {
        send({ type: "load-failed", error: messageOf(err) });
      });
      return;
    case "ask":
      void ask(request.id, request.prefix, request.suffix, request.questions);
      return;
    case "cancel":
      inFlight?.abort();
      return;
  }
});
