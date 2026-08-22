// Renderer-safe public surface of the system-agnostic core.
// NOTE: adapters are intentionally NOT re-exported here — they pull in Node-only
// dependencies (papaparse) and must only be imported by the main process via
// "@core/adapters". The renderer imports this barrel for pure logic + types.
export * from "./config";
export * from "./coercion";
export * from "./automapping";
export * from "./completion";
export * from "./prepare";
export * from "./prepare-names";
export * from "./session";
export * from "./labels";
export * from "./conditions";
export * from "./decorations";
export * from "./shortcuts";
// Adapter interface types only (no concrete adapters / no papaparse).
export type {
  AdapterInput,
  AdapterManifest,
  OutputColumn,
  ParseResult,
  SourceAdapter,
  SinkAdapter,
  ValidationIssue,
} from "./adapters/interfaces";
export type { CoercedValue } from "./types/values";
export type { ProvenanceToken, RawFieldValue, RawRecord, SourceDocument } from "./types/source";
export type { CompletionStatus, LabeledRecord } from "./types/labeling";
export type {
  ConfigLoadResponse,
  ExportRequest,
  ExportResponse,
  InputLoadResponse,
  JoinAnalyzeResponse,
  JoinKind,
  JoinRequest,
  JoinRunResponse,
  LabelMap,
  PrepareFileInfo,
  PrepareFilePickResponse,
  RecentPaths,
  RecordView,
  SessionData,
  SourceFingerprint,
  SplitAnalyzeResponse,
  SplitRequest,
  SplitRunResponse,
  UpdateStatus,
} from "./types/view";
export * from "./ipc";
