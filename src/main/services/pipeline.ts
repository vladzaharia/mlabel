import {
  coerceValue,
  evaluateRecord,
  resolveLabelValues,
  seedLabelValues,
  type AppConfig,
  type CoercedValue,
  type LabelMap,
  type LabeledRecord,
  type OutputField,
  type RecordView,
  type SourceDocument,
} from "@core";
import type { AdapterRegistry } from "@core/adapters";

/** Pure (no fs, no Electron) input/export pipeline — fully unit-testable. */

export interface BuiltInput {
  records: RecordView[];
  inputValues: Map<number, Record<string, CoercedValue>>;
}

export interface ExportArtifacts {
  outputContent: string;
  remainingContent?: string;
  completeCount: number;
  remainingCount: number;
}

function toLabelMap(values: Record<string, CoercedValue | undefined>): LabelMap {
  const out: LabelMap = {};
  for (const [key, value] of Object.entries(values)) out[key] = value ?? null;
  return out;
}

function mergeLabels(
  seeded: Record<string, CoercedValue | undefined>,
  user: LabelMap | undefined,
): Record<string, CoercedValue | undefined> {
  const merged: Record<string, CoercedValue | undefined> = { ...seeded };
  if (user) for (const [key, value] of Object.entries(user)) merged[key] = value ?? undefined;
  return merged;
}

/** Coerce every record's input fields and seed auto-copied label values. */
export function buildRecordViews(config: AppConfig, document: SourceDocument): BuiltInput {
  const inputValues = new Map<number, Record<string, CoercedValue>>();

  const records: RecordView[] = document.records.map((record) => {
    const values: Record<string, CoercedValue> = {};
    const errors: { field: string; message: string }[] = [];
    for (const field of config.input.fields) {
      const result = coerceValue(field, record.fields[field.name]);
      if (result.ok) values[field.name] = result.value;
      else {
        values[field.name] = null;
        errors.push({ field: field.name, message: result.errors[0]?.message ?? "Invalid value." });
      }
    }
    inputValues.set(record.index, values);
    const seeded = seedLabelValues(values, config.output.fields);
    return {
      index: record.index,
      inputValues: values,
      labelValues: toLabelMap(seeded),
      coercionErrors: errors,
    };
  });

  return { records, inputValues };
}

/** Split records into complete (output) and incomplete (remaining) and serialize both. */
export function buildExport(
  config: AppConfig,
  document: SourceDocument,
  inputValues: Map<number, Record<string, CoercedValue>>,
  labels: Record<number, LabelMap>,
  registry: AdapterRegistry,
  /** Answers given once up front, written onto every row. */
  prefill?: LabelMap,
): ExportArtifacts {
  const outputFields: readonly OutputField[] = config.output.fields;
  const completeRecords: LabeledRecord[] = [];
  const incomplete: number[] = [];

  for (const record of document.records) {
    const values = inputValues.get(record.index) ?? {};
    const seeded = seedLabelValues(values, outputFields);
    // Session answers merge in through the same helper the progress bar uses,
    // so what the labeler was told is complete is exactly what gets written.
    const merged = resolveLabelValues(
      mergeLabels(seeded, labels[record.index]),
      prefill,
      outputFields,
    );
    if (evaluateRecord(merged, outputFields).status === "complete") {
      completeRecords.push({
        index: record.index,
        inputValues: values,
        labelValues: merged,
        status: "complete",
        provenance: record.provenance,
      });
    } else {
      incomplete.push(record.index);
    }
  }

  const outputContent = registry.sink(config.output.adapterId).serialize(
    completeRecords,
    outputFields.map((f) => ({ name: f.name })),
    config.output.adapterConfig,
  );

  let remainingContent: string | undefined;
  if (incomplete.length > 0) {
    const remainingRecords = incomplete.map((i) => document.records[i]!);
    remainingContent = registry.source(config.input.adapterId).reemit(remainingRecords);
  }

  return {
    outputContent,
    remainingContent,
    completeCount: completeRecords.length,
    remainingCount: incomplete.length,
  };
}
