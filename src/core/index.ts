// Renderer-safe public surface of the system-agnostic core.
// NOTE: adapters are intentionally NOT re-exported here — they pull in Node-only
// dependencies (papaparse) and must only be imported by the main process via
// "@core/adapters". The renderer imports this barrel for pure logic + types.
export * from "./config";
export * from "./coercion";
export * from "./automapping";
export * from "./completion";
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
export * from "./ipc";
