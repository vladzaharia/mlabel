import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@core";

const { getPathMock } = vi.hoisted(() => ({ getPathMock: vi.fn<(name: string) => string>() }));

vi.mock("electron", () => ({
  app: { getPath: getPathMock },
}));

// Import after the electron mock so `app.getPath` resolves to the temp dir.
import {
  clearSession,
  flushSession,
  getRecent,
  loadSessionFor,
  saveSession,
  setRecent,
  SESSION_VERSION,
} from "./session-store";

const sample: SessionData = {
  configPath: "/cfg/mlabel.jsonc",
  inputPath: "/data/input.csv",
  index: 3,
  labels: { 0: { verdict: "good" }, 2: { verdict: "bad", score: 7 } },
};

/** saveSession is fire-and-forget; this helper flushes before returning. */
async function save(data: SessionData): Promise<void> {
  saveSession(data);
  await flushSession();
}

describe("session-store", () => {
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mlabel-session-store-"));
    getPathMock.mockReturnValue(dir);
    // Flush then clear any write the previous test may have enqueued but not
    // awaited — the module-level queue persists across tests in the same file.
    await clearSession();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a saved session when config + input paths match", async () => {
    await save(sample);
    const loaded = await loadSessionFor(sample.configPath, sample.inputPath);
    expect(loaded).toEqual({ ...sample, version: SESSION_VERSION });
  });

  it("stamps the session version on write so a later build can recognise it", async () => {
    await save(sample);
    const raw = JSON.parse(readFileSync(join(dir, "session.json"), "utf8")) as {
      version?: number;
    };
    expect(raw.version).toBe(SESSION_VERSION);
  });

  // The file holds coerced values whose meaning depends on the schema, so a
  // session from a shape this build doesn't know is discarded rather than
  // trusted — a mismatched read is worse than starting fresh. Written directly,
  // since saveSession always stamps the current version.
  const writeRaw = (data: unknown): void =>
    writeFileSync(join(dir, "session.json"), JSON.stringify(data), "utf8");

  it("discards a session written by a newer build", async () => {
    writeRaw({ ...sample, version: SESSION_VERSION + 1 });
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toBeNull();
  });

  it("discards a legacy session that predates versioning", async () => {
    writeRaw(sample); // `sample` carries no version
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toBeNull();
  });

  it("returns null when the config path does not match", async () => {
    await save(sample);
    expect(await loadSessionFor("/other/config.jsonc", sample.inputPath)).toBeNull();
  });

  it("returns null when the input path does not match", async () => {
    await save(sample);
    expect(await loadSessionFor(sample.configPath, "/other/input.csv")).toBeNull();
  });

  it("returns null when nothing was ever saved", async () => {
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toBeNull();
  });

  it("clearSession removes the session and is idempotent", async () => {
    await save(sample);
    await clearSession();
    await expect(clearSession()).resolves.toBeUndefined(); // double-clear must not throw
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toBeNull();
  });

  it("getRecent returns an empty object before anything is stored", async () => {
    expect(await getRecent()).toEqual({});
  });

  it("setRecent merges partial updates", async () => {
    await setRecent({ config: "/cfg/a.jsonc" });
    await setRecent({ input: "/data/a.csv" });
    expect(await getRecent()).toEqual({ config: "/cfg/a.jsonc", input: "/data/a.csv" });

    await setRecent({ config: "/cfg/b.jsonc" });
    expect(await getRecent()).toEqual({ config: "/cfg/b.jsonc", input: "/data/a.csv" });
  });

  // --- New durability tests ---

  it("rapid saveSession ×N then flushSession → file holds last payload", async () => {
    const N = 20;
    for (let i = 0; i < N; i++) {
      saveSession({ ...sample, index: i });
    }
    await flushSession();
    const loaded = await loadSessionFor(sample.configPath, sample.inputPath);
    expect(loaded?.index).toBe(N - 1);
  });

  it("saveSession then clearSession → file is absent", async () => {
    saveSession(sample);
    await clearSession(); // clearSession awaits until the file is gone
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toBeNull();
  });

  it("clearSession then saveSession then flush → file holds payload", async () => {
    await clearSession(); // clears nothing (idempotent)
    saveSession(sample);
    await flushSession();
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toEqual({
      ...sample,
      version: SESSION_VERSION,
    });
  });
});
