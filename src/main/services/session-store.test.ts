import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@core";

const { getPathMock } = vi.hoisted(() => ({ getPathMock: vi.fn<(name: string) => string>() }));

vi.mock("electron", () => ({
  app: { getPath: getPathMock },
}));

// Import after the electron mock so `app.getPath` resolves to the temp dir.
import { clearSession, getRecent, loadSessionFor, saveSession, setRecent } from "./session-store";

const sample: SessionData = {
  configPath: "/cfg/mlabel.jsonc",
  inputPath: "/data/input.csv",
  index: 3,
  labels: { 0: { verdict: "good" }, 2: { verdict: "bad", score: 7 } },
};

describe("session-store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mlabel-session-store-"));
    getPathMock.mockReturnValue(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a saved session when config + input paths match", async () => {
    await saveSession(sample);
    const loaded = await loadSessionFor(sample.configPath, sample.inputPath);
    expect(loaded).toEqual(sample);
  });

  it("returns null when the config path does not match", async () => {
    await saveSession(sample);
    expect(await loadSessionFor("/other/config.jsonc", sample.inputPath)).toBeNull();
  });

  it("returns null when the input path does not match", async () => {
    await saveSession(sample);
    expect(await loadSessionFor(sample.configPath, "/other/input.csv")).toBeNull();
  });

  it("returns null when nothing was ever saved", async () => {
    expect(await loadSessionFor(sample.configPath, sample.inputPath)).toBeNull();
  });

  it("clearSession removes the session and is idempotent", async () => {
    await saveSession(sample);
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
});
