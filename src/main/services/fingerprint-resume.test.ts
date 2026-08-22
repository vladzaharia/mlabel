/**
 * Integration tests: fingerprint capture + resume-stale detection.
 *
 * We test the fingerprint path by exercising coordinator + session-store
 * together in a temp directory (same pattern as session-store.test.ts).
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configText } from "@test/fixtures/config";

// ---------------------------------------------------------------------------
// Electron mock — must happen before importing anything that touches `electron`
// ---------------------------------------------------------------------------
const { getPathMock } = vi.hoisted(() => ({ getPathMock: vi.fn<(name: string) => string>() }));

vi.mock("electron", () => ({
  app: { getPath: getPathMock },
  dialog: { showOpenDialog: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import { appState } from "../state";
import { loadInputFromPath } from "./coordinator";
import { flushSession, saveSession } from "./session-store";
import type { SessionData } from "@core";

// ---------------------------------------------------------------------------
// A minimal valid config that will let the CSV adapter parse a two-column file
// ---------------------------------------------------------------------------
const CONFIG_TEXT = configText({
  input: [{ name: "id", title: true }, "text"],
  output: [{ name: "verdict", kind: "choice", choices: ["good", "bad"] }],
});

const CSV_CONTENT = "id,text\n1,hello\n2,world\n";
const CSV_MODIFIED = "id,text\n1,hello\n2,WORLD\n"; // one byte changed

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function save(data: SessionData): Promise<void> {
  saveSession(data);
  await flushSession();
}

describe("fingerprint-based resume staleness", () => {
  let dir: string;
  let csvPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "mlabel-fp-"));
    getPathMock.mockReturnValue(dir);
    csvPath = join(dir, "input.csv");
    writeFileSync(csvPath, CSV_CONTENT, "utf8");

    // Load a valid config into appState (loadInputFromPath needs one)
    const { loadConfig } = await import("@core/config");
    const result = loadConfig(CONFIG_TEXT);
    if (!result.ok) throw new Error("config parse failed");
    appState.setConfig(result.config, join(dir, "test.jsonc"));
  });

  afterEach(() => {
    appState.reset();
    rmSync(dir, { recursive: true, force: true });
  });

  it("response is not stale when there is no saved session (no source)", async () => {
    const response = await loadInputFromPath(csvPath);
    expect(response.ok).toBe(true);
    expect(response.resumeStale).toBeUndefined();
  });

  it("stamps the fingerprint on save; reload same bytes with different mtime → NOT stale", async () => {
    // First load: captures fingerprint; autosave stamps it via saveSessionStamped
    const r1 = await loadInputFromPath(csvPath);
    expect(r1.ok).toBe(true);
    expect(appState.input?.fingerprint).toBeDefined();

    // Save the session with the fingerprint stamped (as coordinator does it)
    const { saveSessionStamped } = await import("./coordinator");
    saveSessionStamped({
      configPath: appState.configPath!,
      inputPath: csvPath,
      index: 0,
      labels: { 0: { verdict: "good" } },
    });
    await flushSession();

    // Change only the mtime (touch the file without changing content)
    const past = new Date(Date.now() - 60_000);
    utimesSync(csvPath, past, past);

    // Reload: same bytes, different mtime → NOT stale
    const r2 = await loadInputFromPath(csvPath);
    expect(r2.ok).toBe(true);
    expect(r2.resumeStale).toBe(false);
  });

  it("one byte modified → resumeStale true", async () => {
    // Load and stamp
    const r1 = await loadInputFromPath(csvPath);
    expect(r1.ok).toBe(true);

    const { saveSessionStamped } = await import("./coordinator");
    saveSessionStamped({
      configPath: appState.configPath!,
      inputPath: csvPath,
      index: 0,
      labels: { 0: { verdict: "good" } },
    });
    await flushSession();

    // Write different content
    writeFileSync(csvPath, CSV_MODIFIED, "utf8");

    const r2 = await loadInputFromPath(csvPath);
    expect(r2.ok).toBe(true);
    expect(r2.resumeStale).toBe(true);
  });

  it("legacy session without source field → NOT stale (unverified)", async () => {
    // Manually save a session without a source fingerprint (legacy format)
    const legacy: SessionData = {
      configPath: appState.configPath!,
      inputPath: csvPath,
      index: 0,
      labels: { 0: { verdict: "good" } },
      // no `source` field
    };
    await save(legacy);

    const r = await loadInputFromPath(csvPath);
    expect(r.ok).toBe(true);
    // Legacy sessions without `source` are treated as NOT stale
    expect(r.resumeStale).toBeUndefined();
  });
});
