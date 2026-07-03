import { basename, dirname, extname, join } from "node:path";
import type { JoinKind } from "@core";
import { PART_SUFFIX, partFileNames } from "@core";

/**
 * Deterministic split targets next to the source: `data.csv` × 3 →
 * `data-part1-of-3.csv` …; naming pattern lives in core (`partFileNames`)
 * so the renderer preview and the writer can never disagree.
 */
export function splitTargetPaths(inputPath: string, parts: number): string[] {
  const dir = dirname(inputPath);
  return partFileNames(inputPath, parts).map((name) => join(dir, name));
}

/**
 * Default save-dialog filename for a join, derived from the first input file:
 * part and `-output`/`-remaining` suffixes are stripped, then the join kind is
 * appended — `data-part1-of-3-output.csv` → `data-output-joined.csv`.
 */
export function defaultJoinFileName(kind: JoinKind, firstPath: string): string {
  const ext = extname(firstPath);
  const base = basename(firstPath, ext)
    .replace(/-(output|remaining)$/, "")
    .replace(PART_SUFFIX, "");
  return `${base}-${kind}-joined${ext}`;
}
