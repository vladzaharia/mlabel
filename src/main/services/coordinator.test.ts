/**
 * Coordinator: input loading, export naming, and write durability.
 *
 * This file owns the paths that turn labels into files on disk, so it is tested
 * against a real temp directory rather than a mocked filesystem.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configText } from "@test/fixtures/config";

const { getPathMock } = vi.hoisted(() => ({ getPathMock: vi.fn<(name: string) => string>() }));

vi.mock("electron", () => ({
  app: { getPath: getPathMock },
  dialog: { showOpenDialog: vi.fn() },
}));

// Imported after the electron mock so `app.getPath` resolves to the temp dir.
import { appState } from "../state";
import { exportLabels, loadInputFromPath } from "./coordinator";
import { loadConfig } from "@core/config";
import { clearSession } from "./session-store";

const CONFIG_TEXT = configText({
  input: ["id", "text"],
  output: [
    { name: "id", kind: "copied" },
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
  ],
});

const GOOD_CSV = "id,text\n1,hello\n2,world\n";
/** Missing the `text` column the config declares ⇒ a blocking header error. */
const BAD_CSV = "id,other\n1,hello\n";

function loadedConfig() {
  const result = loadConfig(CONFIG_TEXT);
  if (!result.ok) throw new Error(`fixture config invalid: ${JSON.stringify(result.issues)}`);
  return result.config;
}

describe("coordinator", () => {
  let dir: string;
  let goodPath: string;
  let badPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mlabel-coordinator-"));
    getPathMock.mockReturnValue(dir);
    await clearSession();

    goodPath = join(dir, "input.csv");
    badPath = join(dir, "bad.csv");
    writeFileSync(goodPath, GOOD_CSV, "utf8");
    writeFileSync(badPath, BAD_CSV, "utf8");

    appState.reset();
    appState.setConfig(loadedConfig(), join(dir, "config.jsonc"));
  });

  afterEach(() => {
    appState.reset();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("loadInputFromPath", () => {
    it("loads a matching file and records it in main state", async () => {
      const response = await loadInputFromPath(goodPath);
      expect(response.ok).toBe(true);
      expect(response.records).toHaveLength(2);
      expect(appState.input?.inputPath).toBe(goodPath);
    });

    // A rejected file used to be committed to appState anyway, so a later export
    // wrote the *previous* document's rows under the new file's name.
    it("does not commit a file that fails header validation", async () => {
      await loadInputFromPath(goodPath);
      const before = appState.input;

      const response = await loadInputFromPath(badPath);
      expect(response.ok).toBe(false);
      expect(appState.input).toBe(before);
      expect(appState.input?.inputPath).toBe(goodPath);
    });

    it("reports a missing file without disturbing the loaded input", async () => {
      await loadInputFromPath(goodPath);
      const response = await loadInputFromPath(join(dir, "nope.csv"));
      expect(response.ok).toBe(false);
      expect(appState.input?.inputPath).toBe(goodPath);
    });
  });

  describe("exportLabels", () => {
    beforeEach(async () => {
      await loadInputFromPath(goodPath);
    });

    it("names artifacts after the input stem", async () => {
      const result = await exportLabels({ labels: { 0: { verdict: "good" } } });
      expect(result.ok).toBe(true);
      expect(result.outputPath).toBe(join(dir, "input-output.csv"));
      expect(result.remainingPath).toBe(join(dir, "input-remaining.csv"));
    });

    it("splits complete records from the rest", async () => {
      const result = await exportLabels({ labels: { 0: { verdict: "good" } } });
      expect(result.completeCount).toBe(1);
      expect(result.remainingCount).toBe(1);
      expect(readFileSync(result.outputPath!, "utf8")).toContain("good");
    });

    it("refuses to clobber artifacts from an earlier run", async () => {
      await exportLabels({ labels: { 0: { verdict: "good" } } });
      const first = readFileSync(join(dir, "input-output.csv"), "utf8");

      const second = await exportLabels({ labels: { 0: { verdict: "bad" } } });
      expect(second.ok).toBe(false);
      expect(second.error).toMatch(/already exist/i);
      // The earlier run's files are left exactly as they were.
      expect(readFileSync(join(dir, "input-output.csv"), "utf8")).toBe(first);
    });

    it("overwrites when explicitly told to", async () => {
      await exportLabels({ labels: { 0: { verdict: "good" } } });
      const result = await exportLabels({ labels: { 0: { verdict: "bad" } }, overwrite: true });
      expect(result.ok).toBe(true);
      expect(readFileSync(join(dir, "input-output.csv"), "utf8")).toContain("bad");
    });

    // Writing output and then failing on remaining used to leave a half-finished
    // export on disk alongside an `ok: false` the user could only act on by guessing.
    it("leaves nothing behind when a write fails", async () => {
      // Occupy the remaining-file path with a directory so its write fails
      // *after* the output file has already been written.
      mkdirSync(join(dir, "input-remaining.csv"));

      const result = await exportLabels({ labels: { 0: { verdict: "good" } } });
      expect(result.ok).toBe(false);
      expect(existsSync(join(dir, "input-output.csv"))).toBe(false);
    });

    it("reports a clear error when nothing is loaded", async () => {
      appState.reset();
      const result = await exportLabels({ labels: {} });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/load a config and input/i);
    });
  });

  describe("appState unload", () => {
    it("clearInput drops the document so a stale export is impossible", async () => {
      await loadInputFromPath(goodPath);
      appState.clearInput();
      expect(appState.input).toBeUndefined();
      expect(appState.config).toBeDefined();

      const result = await exportLabels({ labels: {} });
      expect(result.ok).toBe(false);
    });

    it("clearConfig drops the input too, since it is meaningless without a config", async () => {
      await loadInputFromPath(goodPath);
      appState.clearConfig();
      expect(appState.config).toBeUndefined();
      expect(appState.input).toBeUndefined();
    });
  });
});
