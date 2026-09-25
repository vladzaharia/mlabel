/**
 * What the main process and the inference worker say to each other.
 *
 * Its own module so the parent can import these types without pulling in the
 * worker — and therefore without pulling in `node-llama-cpp`, which must only
 * ever be loaded inside the forked process.
 */

export interface LoadRequest {
  type: "load";
  modelPath: string;
  /** JSON Schema the reply is constrained to, built for the loaded config. */
  schema: Record<string, unknown>;
}

export interface AnalyzeRequest {
  type: "analyze";
  /** Correlates a reply with its request; the parent holds the record index. */
  id: number;
  prefix: string;
  suffix: string;
}

export type WorkerRequest = LoadRequest | AnalyzeRequest | { type: "cancel" };

export type WorkerResponse =
  /**
   * `wrapperName` is the chat wrapper node-llama-cpp resolved for this model,
   * and it is worth carrying because it decides whether the thought-channel
   * override in `worker.ts` applied at all.
   *
   * `customWrapperSettings` is keyed by wrapper: the `qwen` entry is read only
   * when the resolution picked `QwenChatWrapper`, and is silently ignored
   * otherwise. A model whose wrapper force-opens a thought segment returns an
   * empty string for every record — indistinguishable, from the outside, from
   * the override having regressed. Reporting the name turns "which is it?" into
   * something a log can answer.
   */
  | { type: "loaded"; wrapperName: string }
  | { type: "load-failed"; error: string }
  | { type: "result"; id: number; json: string }
  | { type: "failed"; id: number; error: string };
