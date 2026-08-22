import type { CoercedValue } from "./values";
import type { ValidationIssue } from "../adapters/interfaces";
import type { AppConfig } from "../config/schema";
import type { ConfigIssue } from "../config/loader";

/** A label-value map as it crosses IPC: `null` means "not yet provided". */
export type LabelMap = Record<string, CoercedValue | null>;

/** A single record as presented to the renderer (no provenance / heavy data). */
export interface RecordView {
  index: number;
  inputValues: Record<string, CoercedValue>;
  /** Seeded with auto-copied values; user fields start `null`. */
  labelValues: LabelMap;
  /** Per-record input coercion problems (field + message). */
  coercionErrors: { field: string; message: string }[];
}

/**
 * A content-addressed snapshot of the source file at the time a session was
 * stamped. `mtimeMs` is stored for diagnostics only — it is NOT compared when
 * checking staleness; two byte-identical re-downloads must not read as stale.
 */
export interface SourceFingerprint {
  size: number;
  mtimeMs: number;
  sha256: string;
}

/** Persisted labeling session (autosave / resume), keyed by config+input path. */
export interface SessionData {
  /**
   * Shape version. A session whose version this build doesn't recognise is
   * discarded rather than trusted: the file holds coerced values whose meaning
   * depends on the schema, and a mismatched read is worse than starting fresh.
   * Absent (legacy, pre-versioning) counts as unrecognised.
   */
  version?: number;
  configPath: string;
  inputPath: string;
  index: number;
  labels: Record<number, LabelMap>;
  /** Answers given once up front, applied to every exported row. */
  prefill?: LabelMap;
  /** Content fingerprint of the source file when this session was last saved. */
  source?: SourceFingerprint;
}

export type ConfigLoadResponse =
  | { status: "loaded"; config: AppConfig; path: string }
  | { status: "none" }
  | { status: "canceled" }
  | { status: "invalid"; issues: ConfigIssue[]; path?: string };

export interface InputLoadResponse {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  records?: RecordView[];
  headerIssues?: ValidationIssue[];
  /** A matching saved session the renderer may offer to resume. */
  resume?: SessionData | null;
  /**
   * True when a saved session exists but its source fingerprint does not match
   * the current file. Absent (undefined) when there is no resume candidate or
   * the saved session pre-dates fingerprinting (legacy).
   */
  resumeStale?: boolean;
  error?: string;
}

export interface ExportRequest {
  labels: Record<number, LabelMap>;
  /** Session answers, merged into every row. See `resolveLabelValues`. */
  prefill?: LabelMap;
  /**
   * Replace artifacts left by an earlier run. Absent, an export that would
   * clobber existing files fails instead, so a re-export can't silently destroy
   * the previous one's output.
   */
  overwrite?: boolean;
}

export interface ExportResponse {
  ok: boolean;
  outputPath?: string;
  remainingPath?: string;
  completeCount?: number;
  remainingCount?: number;
  error?: string;
}

export interface RecentPaths {
  config?: string;
  input?: string;
}

// --- Prepare mode (split one input into parts; join outputs / remaining) ---

/** Which kind of files a join combines; decides the schema it validates against. */
export type JoinKind = "output" | "remaining";

/** One analyzed file in a Prepare operation. */
export interface PrepareFileInfo {
  path: string;
  rowCount: number;
  issues: ValidationIssue[];
  /** True when no `severity: "error"` issue was found. */
  ok: boolean;
}

export interface SplitAnalyzeResponse {
  ok: boolean;
  canceled?: boolean;
  file?: PrepareFileInfo;
  error?: string;
}

export interface SplitRequest {
  path: string;
  parts: number;
}

export interface SplitRunResponse {
  ok: boolean;
  files?: { path: string; rowCount: number }[];
  /** Includes the refuse-to-overwrite case, listing the colliding paths. */
  error?: string;
}

export interface JoinRequest {
  kind: JoinKind;
  paths: string[];
}

export interface JoinAnalyzeResponse {
  ok: boolean;
  canceled?: boolean;
  files?: PrepareFileInfo[];
  /** Header mismatches (error), duplicate rows / dialect notes (warning). */
  crossFileIssues?: ValidationIssue[];
  totalRows?: number;
  error?: string;
}

export interface JoinRunResponse {
  ok: boolean;
  /** True when the user dismissed the save dialog. */
  canceled?: boolean;
  path?: string;
  rowCount?: number;
  duplicateCount?: number;
  error?: string;
}

/** Result of the mode-agnostic Prepare file picker (dialog only, no analysis). */
export interface PrepareFilePickResponse {
  canceled: boolean;
  paths: string[];
}

/**
 * Auto-update progress, pushed from main → renderer. `available-external` is the
 * portable-build case: it can't self-install, so it carries a direct download URL
 * for the matching release asset instead of installing in place.
 */
export type UpdateStatus =
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "available-external"; version: string; url: string }
  | { kind: "error"; message?: string };
