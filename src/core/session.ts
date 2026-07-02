import type { CoercedValue } from "./types/values";
import type { LabelMap, RecordView, SessionData, SourceFingerprint } from "./types/view";

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
