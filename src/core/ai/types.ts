/**
 * What the model is allowed to say, and how the app carries it around.
 *
 * Nothing in this module — or anything that imports it — may be reachable from
 * the export path. That is the same structural guarantee display rules have, and
 * it exists for a stronger reason here: a finding is a guess from a small model,
 * and the file a labeler exports is somebody's ground truth.
 */

/**
 * How loudly a finding is shown.
 *
 * Capped at `warning` on purpose. In this app `danger` means *you must fix
 * this* — a validation error the labeler is expected to act on. Nothing a 2B
 * model says earns that, and borrowing the colour would make a guess look like
 * a defect.
 */
export type FindingSeverity = "info" | "warning";

export interface Finding {
  /** The input field this is about, when it is about one. */
  field?: string;
  /** The card this is about, when it concerns a group rather than one value. */
  card?: string;
  severity: FindingSeverity;
  /** One sentence, in the model's own words. */
  reason: string;
}

export type AnalysisStatus =
  | "queued"
  | "running"
  /** Ran, found nothing worth saying. */
  | "clean"
  | "findings"
  /** Ran and failed — bad JSON, a timeout, a dead worker. */
  | "failed";

export interface Analysis {
  recordIndex: number;
  status: AnalysisStatus;
  findings: readonly Finding[];
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
