// Renderer-safe public surface of the system-agnostic core.
// NOTE: adapters are intentionally NOT re-exported here — they pull in Node-only
// dependencies (papaparse) and must only be imported by the main process via
// "@core/adapters". The renderer imports this barrel for pure logic + types.
export * from "./config";
export * from "./coercion";
export * from "./tolerant";
export * from "./automapping";
export * from "./completion";
export * from "./prepare";
export * from "./prepare-names";
export * from "./session";
export * from "./labels";
export * from "./conditions";
export * from "./decorations";
export * from "./shortcuts";
export * from "./actions";
export * from "./navigation";
export * from "./network-prefs";
export * from "./config-summary";
export * from "./ai/availability";
export * from "./ai/decorate";
export * from "./ai/models";
export * from "./ai/prompt";
export * from "./ai/queue";
export * from "./ai/schema";
export type { Analysis, AnalysisStatus, EngineState, Finding, FindingSeverity } from "./ai/types";
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
  AppInfo,
  AppSettings,
  ColorTheme,
  ConfigLoadResponse,
  ExportRequest,
  ExportResponse,
  InputLoadResponse,
  JoinAnalyzeResponse,
  JoinKind,
  JoinRequest,
  JoinRunResponse,
  LabelMap,
  ModelCallEntry,
  ModelCallStatus,
  NetworkEventKind,
  NetworkLogEntry,
  NetworkOutcome,
  PrepareFileInfo,
  PrepareFilePickResponse,
  RecentPaths,
  RecordView,
  SessionData,
  SourceFingerprint,
  SplitAnalyzeResponse,
  SplitRequest,
  SplitRunResponse,
  ThemeMode,
  UpdateStatus,
} from "./types/view";
export * from "./ipc";
