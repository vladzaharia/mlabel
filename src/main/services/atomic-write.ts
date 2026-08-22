import { dirname } from "node:path";
import * as fsPromises from "node:fs/promises";

export interface AtomicWriteOptions {
  /** Whether to call `handle.sync()` before rename. Default: true. */
  fsync?: boolean;
}

/** Injected fs facade for testing crash scenarios. */
type FsDeps = Pick<typeof fsPromises, "open" | "rename" | "mkdir" | "unlink">;

/** Monotonically increasing sequence for unique temp-file names. */
let seq = 0;

/**
 * Write `text` to `path` atomically via a same-directory temp file.
 *
 * Algorithm:
 * 1. mkdir(dirname(path), recursive)
 * 2. Write to `<path>.<pid>.<seq>.tmp` in the same directory (same filesystem)
 * 3. fsync the file handle (prevents zero-length rename on APFS/ext4)
 * 4. rename(tmp, path)  ← atomic on POSIX and NTFS
 * 5. Best-effort dir fsync (swallowed on Windows EISDIR/EPERM)
 * 6. On any failure: best-effort unlink(tmp), rethrow
 */
export async function writeTextAtomic(
  path: string,
  text: string,
  opts?: AtomicWriteOptions,
  deps?: FsDeps,
): Promise<void> {
  const { open, rename, mkdir, unlink } = deps ?? fsPromises;
  const doFsync = opts?.fsync ?? true;
  const tmp = `${path}.${process.pid}.${seq++}.tmp`;

  await mkdir(dirname(path), { recursive: true });

  let handle: Awaited<ReturnType<typeof fsPromises.open>> | undefined;
  try {
    handle = await open(tmp, "w");
    await handle.writeFile(text, "utf8");
    if (doFsync) await handle.sync();
    await handle.close();
    handle = undefined;

    await rename(tmp, path);

    // Best-effort directory durability (Windows throws EISDIR/EPERM — swallow).
    try {
      const dirHandle = await open(dirname(path), "r");
      try {
        await dirHandle.sync();
      } finally {
        await dirHandle.close();
      }
    } catch {
      // Swallowed: Windows and some platforms don't allow opening directories.
    }
  } catch (err) {
    // Close handle if still open (e.g. rename threw after writeFile).
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
    // Best-effort cleanup of the temp file.
    try {
      await unlink(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
}

/** Write `value` as JSON to `path` atomically. */
export async function writeJsonAtomic(
  path: string,
  value: unknown,
  opts?: AtomicWriteOptions,
  deps?: FsDeps,
): Promise<void> {
  return writeTextAtomic(path, JSON.stringify(value), opts, deps);
}

/**
 * Read and parse JSON from `path`. Returns `undefined` if the file is missing
 * or contains invalid JSON — same tolerance as the current session-store.
 */
export async function readJsonSafe<T>(path: string): Promise<T | undefined> {
  try {
    const text = await fsPromises.readFile(path, "utf8");
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** Remove a file. Succeeds silently when the file does not exist. */
export async function removeFile(path: string): Promise<void> {
  await fsPromises.rm(path, { force: true });
}
