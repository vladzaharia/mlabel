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
  | { type: "loaded" }
  | { type: "load-failed"; error: string }
  | { type: "result"; id: number; json: string }
  | { type: "failed"; id: number; error: string };
