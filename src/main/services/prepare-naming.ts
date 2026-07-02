import { basename, dirname, extname, join } from "node:path";
import type { JoinKind } from "@core";

/** `-partN-of-M` marker appended by splits (stripped before re-deriving names). */
const PART_SUFFIX = /-part\d+-of-\d+$/;

function stem(path: string): string {
  return basename(path, extname(path));
}

/**
 * Deterministic split targets next to the source: `data.csv` × 3 →
 * `data-part1-of-3.csv` …; an existing part suffix is stripped first so
 * re-splitting a part doesn't stack suffixes.
 */
export function splitTargetPaths(inputPath: string, parts: number): string[] {
  const dir = dirname(inputPath);
  const ext = extname(inputPath);
  const base = stem(inputPath).replace(PART_SUFFIX, "");
  return Array.from({ length: parts }, (_, i) =>
    join(dir, `${base}-part${String(i + 1)}-of-${String(parts)}${ext}`),
  );
}

/**
 * Default save-dialog filename for a join, derived from the first input file:
 * part and `-output`/`-remaining` suffixes are stripped, then the join kind is
 * appended — `data-part1-of-3-output.csv` → `data-output-joined.csv`.
 */
export function defaultJoinFileName(kind: JoinKind, firstPath: string): string {
  const ext = extname(firstPath);
  const base = stem(firstPath)
    .replace(/-(output|remaining)$/, "")
    .replace(PART_SUFFIX, "");
  return `${base}-${kind}-joined${ext}`;
}
