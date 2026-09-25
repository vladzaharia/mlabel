/**
 * The disk side of the model store, against a real temp directory.
 *
 * `pruneUnknownModels` deletes multi-gigabyte files, so the interesting tests
 * are the ones about what it must *not* touch. A mocked filesystem would prove
 * the calls were made; only real files prove the right ones survived.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelSpec } from "@core";

const { getPathMock } = vi.hoisted(() => ({ getPathMock: vi.fn<(name: string) => string>() }));

vi.mock("electron", () => ({ app: { getPath: getPathMock } }));

// Imported after the electron mock so `app.getPath` resolves to the temp dir.
import { modelsDir, pruneUnknownModels } from "./model-store";

const spec = (id: string, file: string): ModelSpec => ({
  id,
  name: id,
  repo: `unsloth/${id}`,
  file,
  bytes: 4,
  sha256: "a".repeat(64),
  license: "Apache-2.0",
  parameters: "2B",
  note: "",
});

const KEPT = spec("qwen3.5-2b", "Qwen3.5-2B-UD-Q4_K_XL.gguf");

let dir: string;

/** Create `models/<id>/<file>` with some bytes in it. */
function put(id: string, file: string): string {
  const path = join(modelsDir(), id);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, file), "data");
  return join(path, file);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mlabel-models-"));
  getPathMock.mockReturnValue(dir);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pruneUnknownModels", () => {
  it("does nothing when no model has ever been downloaded", async () => {
    await expect(pruneUnknownModels([KEPT])).resolves.toEqual([]);
  });

  it("keeps a model the manifest still names", async () => {
    const path = put(KEPT.id, KEPT.file);

    await expect(pruneUnknownModels([KEPT])).resolves.toEqual([]);
    expect(existsSync(path)).toBe(true);
  });

  // Dropping a model from the list used to strand its whole directory: no row
  // renders for it, so nothing in the UI could ever delete it.
  it("removes the directory of a model that was dropped", async () => {
    const orphan = put("qwen3-1.7b", "Qwen3-1.7B-Q4_K_M.gguf");
    const kept = put(KEPT.id, KEPT.file);

    const removed = await pruneUnknownModels([KEPT]);

    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(kept)).toBe(true);
    expect(removed).toHaveLength(1);
  });

  // Re-pinning a model at a better quantisation keeps the id and changes the
  // filename, so the new file lands beside the old one rather than replacing it.
  it("removes a superseded quantisation from a model it keeps", async () => {
    const stale = put(KEPT.id, "Qwen3.5-2B-Q4_K_M.gguf");
    const current = put(KEPT.id, KEPT.file);

    const removed = await pruneUnknownModels([KEPT]);

    expect(existsSync(stale)).toBe(false);
    expect(existsSync(current)).toBe(true);
    expect(removed).toEqual([stale]);
  });

  // A download may be in flight while this runs at startup.
  it("leaves a partial download alone", async () => {
    const partial = put(KEPT.id, `${KEPT.file}.part`);

    await expect(pruneUnknownModels([KEPT])).resolves.toEqual([]);
    expect(existsSync(partial)).toBe(true);
  });

  it("leaves non-weight files in a known model's directory alone", async () => {
    const note = put(KEPT.id, "README.md");

    await expect(pruneUnknownModels([KEPT])).resolves.toEqual([]);
    expect(existsSync(note)).toBe(true);
  });

  it("ignores stray files at the top level", async () => {
    mkdirSync(modelsDir(), { recursive: true });
    const stray = join(modelsDir(), "notes.txt");
    writeFileSync(stray, "x");

    await expect(pruneUnknownModels([KEPT])).resolves.toEqual([]);
    expect(existsSync(stray)).toBe(true);
  });

  it("removes everything when the manifest is empty", async () => {
    put(KEPT.id, KEPT.file);

    const removed = await pruneUnknownModels([]);

    expect(removed).toHaveLength(1);
    expect(existsSync(join(modelsDir(), KEPT.id))).toBe(false);
  });
});
