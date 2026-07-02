import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonSafe, removeFile, writeJsonAtomic } from "./atomic-json";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "mlabel-atomic-json-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------
describe("writeJsonAtomic / readJsonSafe: round-trip", () => {
  it("writes and reads back arbitrary JSON values", async () => {
    const path = join(dir, "data.json");
    const value = { foo: "bar", n: 42, nested: { arr: [1, 2, 3] } };
    await writeJsonAtomic(path, value);
    const result = await readJsonSafe<typeof value>(path);
    expect(result).toEqual(value);
  });

  it("creates parent directories that do not yet exist", async () => {
    const path = join(dir, "a", "b", "c", "data.json");
    await writeJsonAtomic(path, { x: 1 });
    const result = await readJsonSafe<{ x: number }>(path);
    expect(result).toEqual({ x: 1 });
  });

  it("overwrites an existing file atomically", async () => {
    const path = join(dir, "data.json");
    await writeJsonAtomic(path, { v: 1 });
    await writeJsonAtomic(path, { v: 2 });
    const result = await readJsonSafe<{ v: number }>(path);
    expect(result).toEqual({ v: 2 });
  });
});

// ---------------------------------------------------------------------------
// No leftover .tmp files after a successful write
// ---------------------------------------------------------------------------
describe("writeJsonAtomic: no leftover .tmp files", () => {
  it("leaves no *.tmp files in the directory after a successful write", async () => {
    const path = join(dir, "data.json");
    await writeJsonAtomic(path, { clean: true });
    const entries = await readdir(dir);
    const tmps = entries.filter((e) => e.endsWith(".tmp"));
    expect(tmps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// readJsonSafe: tolerant of missing / corrupt files
// ---------------------------------------------------------------------------
describe("readJsonSafe: tolerant reads", () => {
  it("returns undefined for a missing file", async () => {
    const result = await readJsonSafe(join(dir, "nonexistent.json"));
    expect(result).toBeUndefined();
  });

  it("returns undefined for a file with corrupt JSON", async () => {
    const path = join(dir, "corrupt.json");
    await writeFile(path, "{ not valid json }", "utf8");
    const result = await readJsonSafe(path);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// removeFile: idempotent
// ---------------------------------------------------------------------------
describe("removeFile", () => {
  it("removes an existing file", async () => {
    const path = join(dir, "to-remove.json");
    await writeFile(path, '{"x":1}', "utf8");
    await removeFile(path);
    const result = await readJsonSafe(path);
    expect(result).toBeUndefined();
  });

  it("does not throw when the file does not exist", async () => {
    await expect(removeFile(join(dir, "missing.json"))).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Crash simulation: destination is never corrupted
// ---------------------------------------------------------------------------
describe("writeJsonAtomic: crash simulation — destination never corrupted", () => {
  const goodValue = { version: "old", data: "intact" };

  async function seedOldFile(path: string): Promise<void> {
    await writeJsonAtomic(path, goodValue);
  }

  it("leaves old value intact when open() throws", async () => {
    const path = join(dir, "safe.json");
    await seedOldFile(path);

    await expect(
      writeJsonAtomic(path, { version: "new" }, undefined, {
        open: async () => {
          throw new Error("open failed");
        },
        rename: async () => {},
        mkdir: async () => undefined,
        unlink: async () => {},
      }),
    ).rejects.toThrow("open failed");

    const result = await readJsonSafe<typeof goodValue>(path);
    expect(result).toEqual(goodValue);
  });

  it("leaves old value intact when rename() throws", async () => {
    const path = join(dir, "safe.json");
    await seedOldFile(path);

    // Use a real fs but intercept rename to fail.
    const fsPromises = await import("node:fs/promises");
    let tmpCreated: string | undefined;
    const origOpen = fsPromises.open.bind(fsPromises);
    const origMkdir = fsPromises.mkdir.bind(fsPromises);
    const origUnlink = fsPromises.unlink.bind(fsPromises);

    let openCallCount = 0;

    await expect(
      writeJsonAtomic(path, { version: "new" }, undefined, {
        open: async (...args: Parameters<typeof fsPromises.open>) => {
          openCallCount++;
          // The first open call is for the tmp file.
          const handle = await origOpen(...args);
          if (openCallCount === 1) {
            // Capture the tmp path from the first arg.
            tmpCreated = String(args[0]);
          }
          return handle;
        },
        mkdir: origMkdir as typeof fsPromises.mkdir,
        rename: async () => {
          throw new Error("rename failed");
        },
        unlink: origUnlink as typeof fsPromises.unlink,
      }),
    ).rejects.toThrow("rename failed");

    const result = await readJsonSafe<typeof goodValue>(path);
    expect(result).toEqual(goodValue);

    // Also verify the .tmp was cleaned up by best-effort unlink.
    if (tmpCreated) {
      const entries = await readdir(dir);
      const tmps = entries.filter((e) => e.endsWith(".tmp"));
      expect(tmps).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Dir-fsync failure is swallowed, write still succeeds
// ---------------------------------------------------------------------------
describe("writeJsonAtomic: dir-fsync failure is non-fatal", () => {
  it("succeeds even when opening the directory for dir-fsync throws", async () => {
    const path = join(dir, "data.json");
    const fsPromises = await import("node:fs/promises");
    const origOpen = fsPromises.open.bind(fsPromises);
    const origMkdir = fsPromises.mkdir.bind(fsPromises);
    const origUnlink = fsPromises.unlink.bind(fsPromises);
    const origRename = fsPromises.rename.bind(fsPromises);

    let openCallCount = 0;

    await writeJsonAtomic(path, { ok: true }, undefined, {
      open: async (...args: Parameters<typeof fsPromises.open>) => {
        openCallCount++;
        // The second open (dir-fsync) should fail; let the first (tmp file) succeed.
        if (openCallCount === 2) throw new Error("EISDIR");
        return origOpen(...args);
      },
      mkdir: origMkdir as typeof fsPromises.mkdir,
      rename: origRename as typeof fsPromises.rename,
      unlink: origUnlink as typeof fsPromises.unlink,
    });

    const result = await readJsonSafe<{ ok: boolean }>(path);
    expect(result).toEqual({ ok: true });
  });
});
