/**
 * What the model is allowed to say, and how the app carries it around.
 *
 * Nothing in this module — or anything that imports it — may be reachable from
 * the export path. That is the same structural guarantee display rules have, and
 * it exists for a stronger reason here: an answer is a guess from a small model,
 * and the file a labeler exports is somebody's ground truth.
 */

import type { Answer } from "./answer";

/**
 * How loudly a model's note is shown.
 *
 * Capped at `warning` on purpose. In this app `danger` means *you must fix
 * this* — a validation error the labeler is expected to act on. Nothing a small
 * model says earns that, and borrowing the colour would make a guess look like
 * a defect.
 */
export type NoteSeverity = "info" | "warning";

export type AnalysisStatus =
  | "queued"
  | "running"
  /**
   * Ran; every answer fell below its threshold.
   *
   * A fact now rather than an inference. Under the old free-text contract
   * "clean" meant the model returned an empty list, which was indistinguishable
   * from a decode that was cut off before the list opened — so the one wrong
   * answer that costs a reviewer something was also the easiest to produce.
   * A question always gets an answer, so this can only mean what it says.
   */
  | "clean"
  | "findings"
  /** Ran and failed — a timeout, a dead worker, a model that would not load. */
  | "failed";

export interface Analysis {
  recordIndex: number;
  status: AnalysisStatus;
  /** One per question asked, in the order they were asked. */
  answers: readonly Answer[];
  /** Which model produced this, so a cache survives the model changing. */
  modelId: string;
  /** Wall-clock milliseconds, for the "this is slow" affordance. */
  elapsedMs?: number;
  /** Set when `status` is `failed`. */
  error?: string;
}

/** What the engine is currently able to do. */
export type EngineState =
  | { kind: "unavailable"; reason: string }
  | { kind: "no-model" }
  | { kind: "downloading"; modelId: string; receivedBytes: number; totalBytes: number }
  | { kind: "loading"; modelId: string }
  | { kind: "ready"; modelId: string }
  | { kind: "error"; message: string };
