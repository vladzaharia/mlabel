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
 */

import type { LlamaChatSession, LlamaContext, LlamaGrammar, LlamaModel } from "node-llama-cpp";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/**
 * Small on purpose.
 *
 * The KV cache is allocated up front from this, and a model's own default can be
 * enormous — Qwen3.5's native window is 262k tokens, which would want gigabytes
 * before a single record was read. One record plus its instructions fits here
 * many times over.
 */
const CONTEXT_SIZE = 4096;

/**
 * Generation cap for one record.
 *
 * The backstop against a model that starts repeating itself in `reasoning`,
 * which is the observed way a decode runs long. A decode that hits this cap
 * produces a *truncated* object rather than a malformed one, and that is
 * reported as a failure rather than parsed: a cut-off answer whose `findings`
 * list never opened is indistinguishable from a clean record, and "clean" is
 * the one wrong answer that costs a reviewer something.
 *
 * Worth knowing if you are tuning this: `node-llama-cpp` *does* honour
 * `maxLength` on a string, all the way through to the GBNF, so the free-text
 * fields could be bounded in the schema and the cap made unreachable. It is
 * not done here yet because the library warns that length bounds the prompt
 * does not also describe tend to produce hallucinated filler, and that
 * trade-off has not been measured against real models.
 */
const MAX_TOKENS = 700;

interface Loaded {
  model: LlamaModel;
  context: LlamaContext;
  session: LlamaChatSession;
  /**
   * Typed as the base `LlamaGrammar` rather than the generic
   * `LlamaJsonSchemaGrammar<T>`: the schema is built at runtime from the loaded
   * config, so there is no literal type for the generic to carry, and only the
   * base interface is needed to hand it to `prompt`.
   */
  grammar: LlamaGrammar;
}

let loaded: Loaded | null = null;
let inFlight: AbortController | null = null;

const send = (message: WorkerResponse): void => {
  process.parentPort.postMessage(message);
};

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : "Unknown inference error.";

async function load(modelPath: string, schema: Record<string, unknown>): Promise<void> {
  const { getLlama } = await import("node-llama-cpp");
  const llama = await getLlama({ build: "never" });
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext({ contextSize: CONTEXT_SIZE });
  const { LlamaChatSession, resolveChatWrapper } = await import("node-llama-cpp");

  /**
   * A reasoning model must not open its thought channel here.
   *
   * Qwen's wrapper force-opens `<think>` at the start of a response, which is
   * the right default for chat and catastrophic with a grammar: the constrained
   * JSON is emitted *inside* the thought segment, `</think>` never arrives
   * because the grammar completes first, and `responseText` comes back as the
   * empty string. Every record fails, and it fails as "the model did not return
   * JSON" — which points at the grammar, the one thing that was working.
   *
   * `modelInitiated` leaves the channel closed unless the model opens it itself,
   * which under a JSON grammar it cannot. The `reasoning` field in the schema is
   * where thinking is supposed to go, and it survives into the parsed output.
   *
   * Worth knowing before adding a model: `openOnResponseStart` is what causes
   * this, and `QwenChatWrapper` is the only wrapper in node-llama-cpp that sets
   * it. A thinking channel in some other model's Jinja template is therefore not
   * the same hazard. Gemma's `reasoning` flag is a different thing — it prepends
   * a `<|think|>` indicator to the *system* message — so turning it off is a
   * matter of not spending context on an instruction the grammar makes
   * impossible to follow, not of avoiding an empty response.
   *
   * Resolved from the model rather than constructed, so the chat template and
   * per-family variations stay auto-detected; only these settings are
   * overridden, and each is ignored for a model of a different family.
   */
  const chatWrapper = resolveChatWrapper(model, {
    customWrapperSettings: {
      qwen: { thoughts: "modelInitiated" },
      gemma4: { reasoning: false },
    },
  });
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), chatWrapper });

  // Built once, reused for every record. Constrained decoding makes invalid
  // tokens unsamplable, so malformed JSON stops being a failure mode at all.
  const grammar = (await llama.createGrammarForJsonSchema(
    schema as Parameters<typeof llama.createGrammarForJsonSchema>[0],
  )) as unknown as LlamaGrammar;

  loaded = { model, context, session, grammar };
  send({ type: "loaded", wrapperName: chatWrapper.wrapperName });
}

async function analyze(id: number, prefix: string, suffix: string): Promise<void> {
  if (!loaded) {
    send({ type: "failed", id, error: "No model is loaded." });
    return;
  }

  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;

  try {
    // The session is reset per record rather than accumulating a conversation:
    // each record is an independent question, and a growing history would both
    // drift and eventually overrun the context.
    loaded.session.resetChatHistory();
    const answer = await loaded.session.prompt(`${prefix}\n\n${suffix}`, {
      grammar: loaded.grammar,
      signal: controller.signal,
      maxTokens: MAX_TOKENS,
    });
    if (!controller.signal.aborted) send({ type: "result", id, json: answer });
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
      void load(request.modelPath, request.schema).catch((err: unknown) => {
        send({ type: "load-failed", error: messageOf(err) });
      });
      return;
    case "analyze":
      void analyze(request.id, request.prefix, request.suffix);
      return;
    case "cancel":
      inFlight?.abort();
      return;
  }
});
