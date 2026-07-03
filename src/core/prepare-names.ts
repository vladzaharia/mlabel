/**
 * Naming pattern for split part files, shared by the renderer (chunk-map
 * preview) and the main process (actual file writer) so displayed names always
 * match written names. Pure string logic — no node:path (core is system-agnostic).
 */

/** `-partN-of-M` marker appended by splits (stripped before re-deriving names). */
export const PART_SUFFIX = /-part\d+-of-\d+$/;

function splitName(path: string): { stem: string; ext: string } {
  const name = path.split(/[/\\]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/** Basenames (no directory) of the part files a split of `sourcePath` produces. */
export function partFileNames(sourcePath: string, parts: number): string[] {
  const { stem, ext } = splitName(sourcePath);
  const base = stem.replace(PART_SUFFIX, "");
  return Array.from(
    { length: parts },
    (_, i) => `${base}-part${String(i + 1)}-of-${String(parts)}${ext}`,
  );
}
