import type { CoercedValue } from "./values";
import type { ProvenanceToken } from "./source";

/** Whether a record's required output fields are satisfied. */
export type CompletionStatus = "unlabeled" | "partial" | "complete";

/**
 * The intermediary the UI and export logic operate on: coerced input values
 * plus the user's (and auto-copied) label values, carrying the original
 * provenance through for faithful re-emit of unlabeled records.
 */
export interface LabeledRecord {
  readonly index: number;
  /** Input values, coerced per the input schema. */
  readonly inputValues: Readonly<Record<string, CoercedValue>>;
  /** Output values: user-entered + auto-copied. `undefined` = not yet provided. */
  labelValues: Record<string, CoercedValue | undefined>;
  status: CompletionStatus;
  /** Pass-through provenance from the originating `RawRecord`. */
  readonly provenance: ProvenanceToken;
}
