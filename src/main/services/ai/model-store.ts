import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import type { ModelSpec } from "@core";

/**
 * Where downloaded weights live, and whether they can be trusted.
 *
 * Under `userData`, which is **per machine** rather than per project — a model
 * fetched while working on one config is still there, and still usable, when a
 * different config is opened. That asymmetry is why the availability rule has a
 * carve-out for "a model is already present".
 */

const DIR = "models";

export const modelsDir = (): string => join(app.getPath("userData"), DIR);

/** Final resting place. A file here has passed its hash check. */
export const modelPath = (spec: ModelSpec): string => join(modelsDir(), spec.id, spec.file);

/**
 * Where a download accumulates.
 *
 * Separate from the final path so an interrupted download can never be mistaken
 * for a complete one: the move into place is the last thing that happens, after
 * the hash matches.
 */
export const partialPath = (spec: ModelSpec): string => `${modelPath(spec)}.part`;

async function sizeOf(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

/** Whether a complete, correctly-sized model is present. */
export async function isModelPresent(spec: ModelSpec): Promise<boolean> {
  return (await sizeOf(modelPath(spec))) === spec.bytes;
}

/** How many bytes of a partial download are already on disk. */
export async function partialBytes(spec: ModelSpec): Promise<number> {
  const size = await sizeOf(partialPath(spec));
  // A partial larger than the finished file is corrupt rather than resumable.
  return size !== null && size < spec.bytes ? size : 0;
}

export async function ensureModelDir(spec: ModelSpec): Promise<void> {
  await mkdir(join(modelsDir(), spec.id), { recursive: true });
}

/** Hash a file without reading it all into memory — these are over a gigabyte. */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/**
 * Promote a verified partial into place.
 *
 * Verifies first and refuses on mismatch, leaving nothing behind. The weights
 * come from a community requantiser rather than from Qwen, so the pinned hash is
 * what makes that acceptable: a changed upload fails here instead of quietly
 * running something nobody reviewed.
 */
export async function finalize(spec: ModelSpec): Promise<{ ok: boolean; error?: string }> {
  const partial = partialPath(spec);
  const size = await sizeOf(partial);
  if (size !== spec.bytes) {
    await rm(partial, { force: true });
    return {
      ok: false,
      error: `Downloaded ${String(size ?? 0)} bytes, expected ${String(spec.bytes)}.`,
    };
  }
  const digest = await sha256OfFile(partial);
  if (digest !== spec.sha256) {
    await rm(partial, { force: true });
    return { ok: false, error: "Downloaded file did not match its expected checksum." };
  }
  await rename(partial, modelPath(spec));
  return { ok: true };
}

/** Remove a model and any partial download of it. */
export async function deleteModel(spec: ModelSpec): Promise<void> {
  await rm(join(modelsDir(), spec.id), { recursive: true, force: true });
}
