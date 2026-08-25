import { fillKind, isSessionFilled } from "./automapping";
import { evaluateRecord } from "./completion";
import type { OutputField } from "./config/schema";
import type { CoercedValue } from "./types/values";
import type { LabelMap } from "./types/view";

/**
 * What will actually be written for one record.
 *
 * A record's exported values come from three places: the per-record labels the
 * user typed, the session answers given once up front, and the timestamp the
 * app stamps. Every question of the form "is this record finished?" has to look
 * at the same merged view — the progress bar, the label form, and the export
 * split all call through here, so they cannot disagree about what will land in
 * the output file.
 */
export function resolveLabelValues(
  record: Readonly<Record<string, CoercedValue | undefined>>,
  session: LabelMap | undefined,
  outputFields: readonly OutputField[],
): Record<string, CoercedValue | undefined> {
  const merged: Record<string, CoercedValue | undefined> = { ...record };
  if (!session) return merged;

  for (const field of outputFields) {
    if (!isSessionFilled(field)) continue;
    const answer = session[field.name];
    // A per-record value wins if one somehow exists; defensive, since nothing
    // writes per-record values into a session-scoped field today.
    if (merged[field.name] === undefined || merged[field.name] === null) {
      merged[field.name] = answer ?? undefined;
    }
  }
  return merged;
}

/** The field that records when a record was labeled, if the config declares one. */
export function timestampField(outputFields: readonly OutputField[]): OutputField | undefined {
  return outputFields.find((f) => fillKind(f) === "timestamp");
}

/** Fields answered once per session rather than per record. */
export function sessionFields(outputFields: readonly OutputField[]): OutputField[] {
  return outputFields.filter(isSessionFilled);
}

/** True when every required session field has a valid answer. */
export function sessionAnswered(session: LabelMap, outputFields: readonly OutputField[]): boolean {
  const fields = sessionFields(outputFields);
  if (fields.length === 0) return true;
  return evaluateRecord(session, fields).status === "complete";
}

/**
 * Stamp the time-labeled field once a record is complete, and again on every
 * later edit to it.
 *
 * `now` is injected rather than read inline so exports stay deterministic —
 * the integration test byte-compares a golden file, which a wall clock would
 * make unpinnable.
 *
 * Returns `labels` unchanged when there is nothing to stamp, so callers can
 * rely on reference equality to skip needless work.
 */
export function stampLabelTime(
  labels: LabelMap,
  session: LabelMap | undefined,
  outputFields: readonly OutputField[],
  now: () => Date,
): LabelMap {
  const field = timestampField(outputFields);
  if (!field) return labels;

  // Judge completeness against the same merged view the export will use, or a
  // record whose only missing piece is a session answer would never stamp.
  const merged = resolveLabelValues(labels, session, outputFields);
  if (evaluateRecord(merged, outputFields).status !== "complete") return labels;

  return { ...labels, [field.name]: now() };
}

/**
 * Add or remove one choice from a multi-select value.
 *
 * Declaration order is preserved rather than click order, so the exported cell
 * is stable however the labeler arrived at the selection. Returns `null` for an
 * empty result, matching what an untouched field holds — an empty array would
 * read as "answered with nothing".
 */
export function toggleChoice(
  current: CoercedValue | null | undefined,
  name: string,
  order: readonly string[],
): string[] | null {
  const selected = new Set(Array.isArray(current) ? current.map(String) : []);
  if (selected.has(name)) selected.delete(name);
  else selected.add(name);
  const ordered = order.filter((choice) => selected.has(choice));
  return ordered.length === 0 ? null : ordered;
}
