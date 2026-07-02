import { createHash } from "node:crypto";
import type { SourceFingerprint } from "@core";

/**
 * Compute a content fingerprint for an already-read file buffer.
 *
 * `stat` is passed in separately so the caller can share a single `readFile`
 * + `stat` call without re-reading the file. `mtimeMs` is stored for
 * diagnostics only; staleness checks use size + sha256 exclusively.
 */
export function fingerprintOf(
  buf: Buffer,
  stat: { size: number; mtimeMs: number },
): SourceFingerprint {
  const sha256 = createHash("sha256").update(buf).digest("hex");
  return { size: stat.size, mtimeMs: stat.mtimeMs, sha256 };
}
