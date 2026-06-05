/**
 * Adapter-agnostic source model. Adapters parse their format into `RawRecord`s
 * and stamp each with an opaque {@link ProvenanceToken}. The core, the renderer,
 * and the config schema never inspect the token — only the adapter that created
 * it can decode it (e.g. to re-emit unlabeled rows byte-for-byte). This is what
 * keeps format specifics (CSV raw bytes, delimiter, BOM) out of the core.
 */

/** Opaque, adapter-owned handle. `T` is known only inside the owning adapter. */
export interface ProvenanceToken<T = unknown> {
  readonly __adapter: string;
  readonly __raw: T;
}

/** Raw, pre-coercion field values handed to the core by an adapter. */
export type RawFieldValue =
  | string
  | number
  | boolean
  | null
  | RawFieldValue[]
  | { [key: string]: RawFieldValue };

export interface RawRecord {
  /** Stable zero-based position in the source document. */
  readonly index: number;
  /** Field values keyed by source column name (CSV: all strings). */
  readonly fields: Readonly<Record<string, RawFieldValue>>;
  /** Adapter-owned, core-opaque handle for faithful re-emit. */
  readonly provenance: ProvenanceToken;
}

export interface SourceDocument {
  readonly adapterId: string;
  /** Source column names, in order. */
  readonly headers: readonly string[];
  readonly totalCount: number;
  readonly records: readonly RawRecord[];
  /** Source-level metadata the adapter wants to surface (encoding, etc.). */
  readonly meta: Readonly<Record<string, unknown>>;
}
