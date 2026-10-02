/**
 * What the main process and the inference worker say to each other.
 *
 * Its own module so the parent can import these types without pulling in the
 * worker — and therefore without pulling in `node-llama-cpp`, which must only
 * ever be loaded inside the forked process.
 */

import type { Answer, TargetedQuestion } from "@core";

export interface LoadRequest {
  type: "load";
  modelPath: string;
  /**
   * Divides the label logits before the softmax.
   *
   * Comes from the model's own entry in `models.ts`, fitted for that exact
   * quantisation. Passed per load rather than read in the worker so the worker
   * holds no knowledge of which files exist.
   */
  temperature: number;
}

export interface AskRequest {
  type: "ask";
  /** Correlates a reply with its request; the parent holds the record index. */
  id: number;
  prefix: string;
  suffix: string;
  /**
   * Every question for this record, asked against one encode of the state.
   *
   * Sent together rather than one request per question because the state is
   * encoded once and each question appended to it — splitting them across
   * requests would re-encode the record every time.
   */
  questions: readonly TargetedQuestion[];
}

export type WorkerRequest = LoadRequest | AskRequest | { type: "cancel" };

export type WorkerResponse =
  | { type: "loaded" }
  | { type: "load-failed"; error: string }
  | { type: "answers"; id: number; answers: Answer[] }
  | { type: "failed"; id: number; error: string };
