import type { LabeledRecord } from "../types/labeling";
import type { RawRecord, SourceDocument } from "../types/source";

export interface AdapterManifest {
  readonly id: string;
  readonly label: string;
  /** File extensions this adapter handles (lowercase, with dot), e.g. [".csv"]. */
  readonly extensions: readonly string[];
}

/** Input handed to a source adapter. Keeps Node fs out of the core: the main
 *  process reads bytes and passes text; param-based sources (DB) use `params`. */
export type AdapterInput =
  | { kind: "content"; name: string; text: string }
  | { kind: "params"; name?: string; params: unknown };

export type IssueKind = "missing" | "extra" | "duplicate" | "coercion" | "schema";
export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  kind: IssueKind;
  severity: IssueSeverity;
  message: string;
  recordIndex?: number;
  field?: string;
}

export interface ParseResult {
  document: SourceDocument;
  issues: ValidationIssue[];
}

/**
 * Parses a source format into the generic document model and re-emits
 * unlabeled records for the `*-remaining` file.
 *
 * `reemit` is **value-faithful, not byte-faithful**: values, column order and
 * the detected dialect round-trip exactly (see the parse→reemit→parse property
 * test in `csv.test.ts`), but incidental formatting — BOM, header whitespace,
 * original quoting style, blank lines, trailing newline — does not. That is the
 * contract downstream code may rely on.
 */
export interface SourceAdapter {
  readonly manifest: AdapterManifest;
  /**
   * @param input         source content / params
   * @param expectedFields input schema field names, for header validation
   * @param adapterConfig opaque, adapter-owned options (e.g. delimiter)
   */
  parse(
    input: AdapterInput,
    expectedFields: readonly string[],
    adapterConfig?: unknown,
  ): ParseResult;
  /** Re-emit the given records in the source format, byte-faithfully when possible. */
  reemit(records: readonly RawRecord[]): string;
}

/** A minimal description of an output column for serialization (name + order). */
export interface OutputColumn {
  name: string;
}

/** Serializes complete labeled records into an output format. */
export interface SinkAdapter {
  readonly manifest: AdapterManifest;
  /**
   * @param records  complete labeled records to write
   * @param columns  output columns, in schema order
   * @param adapterConfig opaque, adapter-owned options
   */
  serialize(
    records: readonly LabeledRecord[],
    columns: readonly OutputColumn[],
    adapterConfig?: unknown,
  ): string;
}
