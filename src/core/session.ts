import { coerceValue } from "./coercion";
import type { OutputField } from "./config/schema";
import type { CoercedValue } from "./types/values";
import type { LabelMap, RecordView, SessionData, SourceFingerprint } from "./types/view";

/**
 * Re-type a label map read back from `session.json`.
 *
 * Sessions are persisted with plain `JSON.stringify` and read with plain
 * `JSON.parse`, so anything JSON can't represent arrives as something else —
 * a `Date` leaves as an ISO string and comes back a string. `validateOutputValue`
 * then rejects it (`value instanceof Date`), and a record the labeler had
 * finished silently reverted to incomplete the moment they resumed.
 *
 * Rather than teach the persistence layer about every value kind, re-coerce
 * through the same `coerceValue` the input pipeline uses. A value that already
 * survived JSON intact coerces to itself, so this is a no-op for most fields.
 */
export function reviveLabelMap(raw: LabelMap, outputFields: readonly OutputField[]): LabelMap {
  const out: LabelMap = { ...raw };
  for (const field of outputFields) {
    const value = raw[field.name];
    if (value === undefined || value === null) continue;
    // A field *is* its type, so this is the same coercion the input pipeline runs.
    const result = coerceValue(field, value);
    // Keep the original on failure: a value we can't parse is still the user's
    // data, and dropping it would turn a visible error into silent loss.
    if (result.ok) out[field.name] = result.value;
  }
  return out;
}

/**
 * Whether two source fingerprints represent the same file content.
 *
 * Compares `size` and `sha256` only. `mtimeMs` is deliberately excluded:
 * a byte-identical re-download must not be treated as stale.
 */
export function fingerprintsEqual(a: SourceFingerprint, b: SourceFingerprint): boolean {
  return a.size === b.size && a.sha256 === b.sha256;
}

/**
 * Whether a persisted session holds real labeling progress, i.e. differs from
 * the freshly seeded baseline. Records seed their `labelValues` with auto-copied
 * values, so "non-empty" is not enough — a session only counts as changed when a
 * saved label differs from what the record would start with.
 */
export function sessionHasChanges(resume: SessionData, records: RecordView[]): boolean {
  return records.some((record) => {
    const saved = resume.labels[record.index];
    return saved !== undefined && !labelMapsEqual(record.labelValues, saved);
  });
}

function labelMapsEqual(a: LabelMap, b: LabelMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!valuesEqual(a[key] ?? null, b[key] ?? null)) return false;
  }
  return true;
}

function valuesEqual(a: CoercedValue | null, b: CoercedValue | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => valuesEqual(v, b[i] ?? null))
    );
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!valuesEqual(a[key] ?? null, b[key] ?? null)) return false;
    }
    return true;
  }
  return false;
}
