import { describe, expect, it, vi, beforeEach } from "vitest";
import electronUpdater from "electron-updater";
import { checkForUpdatesManually, startUpdates } from "./updater";

/**
 * Tests for checkForUpdatesManually.
 *
 * The function guards on the module-level `started` flag. We use vi.mock
 * with inline factories (no top-level variable references inside the factory)
 * then access the mocked module via the imported binding.
 */

// Mutable flag so we can simulate a packaged app mid-test.
let mockIsPackaged = false;

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged;
    },
    isInApplicationsFolder: () => true,
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {
      checkForUpdates: vi.fn(async () => null),
      quitAndInstall: vi.fn(),
      logger: null,
      autoDownload: true,
      autoInstallOnAppQuit: true,
      on: vi.fn(),
    },
  },
}));

const mockedCheckForUpdates = vi.mocked(
  electronUpdater.autoUpdater.checkForUpdates as unknown as ReturnType<typeof vi.fn>,
);

describe("checkForUpdatesManually", () => {
  beforeEach(() => {
    mockedCheckForUpdates.mockClear();
  });

  it("is a no-op when updates have never been armed (started===false)", () => {
    // On a fresh module the started flag is false; checkForUpdatesManually must be inert.
    // We verify this by asserting no call was made (the module starts with started=false).
    const callsBefore = mockedCheckForUpdates.mock.calls.length;
    checkForUpdatesManually();
    expect(mockedCheckForUpdates.mock.calls.length).toBe(callsBefore);
  });

  it("calls autoUpdater.checkForUpdates when updates are armed", () => {
    // Arm the updater by simulating a packaged build.
    mockIsPackaged = true;
    startUpdates(); // sets started=true and fires checkForUpdates once (the arm check).
    mockedCheckForUpdates.mockClear(); // ignore the arm-time call.

    checkForUpdatesManually();
    expect(mockedCheckForUpdates).toHaveBeenCalledOnce();
  });
});
