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

/** Persisted labeling session (autosave / resume), keyed by config+input path. */
export interface SessionData {
  configPath: string;
  inputPath: string;
  index: number;
  labels: Record<number, LabelMap>;
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
  error?: string;
}

export interface ExportRequest {
  labels: Record<number, LabelMap>;
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
