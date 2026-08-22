import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configText } from "@test/fixtures/config";

const mocks = vi.hoisted(() => ({
  getPath: vi.fn<(name: string) => string>(),
  showOpenDialog: vi.fn(),
  setUpdatesEnabled: vi.fn(),
  startUpdates: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: mocks.getPath },
  dialog: { showOpenDialog: mocks.showOpenDialog },
}));
vi.mock("./updater", () => ({ startUpdates: mocks.startUpdates }));
vi.mock("./network-guard", () => ({ setUpdatesEnabled: mocks.setUpdatesEnabled }));

// Imported after the mocks so electron/updater/network-guard resolve to them.
import { pickConfig } from "./config-service";

/** Minimal valid config; the network block is set (or omitted) per test. */
const configFor = (updateChecks?: boolean): string => configText({ updateChecks });

describe("config-service: pickConfig", () => {
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mlabel-config-service-"));
    mocks.getPath.mockReturnValue(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function pickReturns(path: string): void {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [path] });
  }

  it("loads a config with updateChecks:false, closes the gate, and never starts updates", async () => {
    const path = join(dir, "config.jsonc");
    writeFileSync(path, configFor(false), "utf8");
    pickReturns(path);

    const result = await pickConfig();

    expect(result.status).toBe("loaded");
    expect(mocks.setUpdatesEnabled).toHaveBeenCalledTimes(1);
    expect(mocks.setUpdatesEnabled).toHaveBeenCalledWith(false);
    expect(mocks.startUpdates).not.toHaveBeenCalled();
  });

  it("loads a permitting config, opens the gate, then starts updates", async () => {
    const path = join(dir, "config.jsonc");
    writeFileSync(path, configFor(), "utf8"); // network omitted ⇒ updateChecks defaults true
    pickReturns(path);

    const result = await pickConfig();

    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.path).toBe(path);
      expect(result.config.network.updateChecks).toBe(true);
    }
    expect(mocks.setUpdatesEnabled).toHaveBeenCalledWith(true);
    expect(mocks.startUpdates).toHaveBeenCalledTimes(1);
    // The hard network gate must open before update checks begin.
    expect(mocks.setUpdatesEnabled.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.startUpdates.mock.invocationCallOrder[0]!,
    );
  });

  it("returns status invalid with a message for an unreadable file path", async () => {
    const path = join(dir, "does-not-exist.jsonc");
    pickReturns(path);

    const result = await pickConfig();

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") {
      expect(result.path).toBe(path);
      expect(result.issues[0]?.message).toContain("Could not read config file");
    }
    expect(mocks.setUpdatesEnabled).not.toHaveBeenCalled();
    expect(mocks.startUpdates).not.toHaveBeenCalled();
  });

  it("returns status invalid for a file that fails schema validation", async () => {
    const path = join(dir, "config.jsonc");
    writeFileSync(path, `{ "input": {} }`, "utf8");
    pickReturns(path);

    const result = await pickConfig();

    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.issues.length).toBeGreaterThan(0);
    expect(mocks.startUpdates).not.toHaveBeenCalled();
  });

  it("returns status canceled when the picker is dismissed", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    const result = await pickConfig();

    expect(result).toEqual({ status: "canceled" });
    expect(mocks.setUpdatesEnabled).not.toHaveBeenCalled();
    expect(mocks.startUpdates).not.toHaveBeenCalled();
  });
});
