/**
 * A complete `window.api` stub for renderer tests.
 *
 * `IpcApi` is the single source of truth for the IPC surface, and seven test
 * files used to hand-build all of its methods — so every new method broke all
 * seven. Building it once here means `tsc` points at one file instead.
 */

import { DEFAULT_MODEL_ID } from "@core";
import type { AppSettings, IpcApi } from "@core";

/** The defaults, restated here so the fixture does not import Electron glue. */
const TEST_SETTINGS: AppSettings = {
  version: 1,
  themeMode: "system",
  colorTheme: "cobalt",
  shortcuts: {},
  updateChecks: true,
  aiEnabled: false,
  aiModelId: DEFAULT_MODEL_ID,
};

/**
 * Every method, stubbed to the most inert plausible response: nothing succeeds,
 * nothing throws, no listener ever fires. Override only what a test cares about.
 */
export function makeIpcApi(overrides: Partial<IpcApi> = {}): IpcApi {
  // Settings are stateful even in the stub: the real handler merges a patch and
  // returns what is now in force, and the renderer reconciles from that. A stub
  // returning a constant would silently undo every change it was handed.
  let settings: AppSettings = { ...TEST_SETTINGS };

  const base = {
    ping: async () => "pong" as const,

    getTheme: async () => true,
    onThemeChange: () => () => {},

    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
    installUpdate: async () => {},
    checkForUpdates: async () => {},
    openExternal: async () => {},
    revealPath: async () => {},

    getStartupConfig: async () => ({ status: "none" as const }),
    pickConfig: async () => ({ status: "canceled" as const }),

    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: () => "",
    unloadInput: async () => {},
    unloadConfig: async () => {},

    saveSession: async () => {},
    clearSession: async () => {},
    getSessionInfo: async () => null,

    getAppInfo: async () => ({
      version: "0.0.0-test",
      platform: "test",
      arch: "test",
      packaged: false,
      updatesArmed: false,
      updatesAllowedByConfig: true,
      aiAllowedByConfig: true,
      modelDownloadAllowedByConfig: true,
      aiPlatformSupported: true,
    }),
    getSettings: async () => settings,
    setSettings: async (patch: Partial<AppSettings>) => {
      settings = { ...settings, ...patch };
      return settings;
    },
    resetSettings: async () => {
      settings = { ...TEST_SETTINGS };
      return settings;
    },
    onOpenSettings: () => () => {},

    getNetworkLog: async () => [],
    onNetworkLog: () => () => {},
    getModelLog: async () => [],
    onModelCall: () => () => {},

    getAiStatus: async () => ({ state: { kind: "no-model" as const }, downloaded: [], cached: [] }),
    downloadModel: async () => {},
    cancelModelDownload: async () => {},
    deleteModel: async () => {},
    setAiIndex: async () => {},
    onAiStatus: () => () => {},
    onAiAnalysis: () => () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),

    pickSplitFile: async () => ({ ok: false, canceled: true }),
    analyzeSplitFile: async () => ({ ok: false, canceled: true }),
    pickPrepareFiles: async () => ({ canceled: true, paths: [] }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  } satisfies IpcApi;

  return { ...base, ...overrides };
}

/**
 * Install the stub on `window`, along with the platform tag the chrome reads.
 * Defaults to darwin so title-bar padding is deterministic across machines.
 */
export function installIpcApi(
  overrides: Partial<IpcApi> = {},
  platform: "darwin" | "win32" | "linux" = "darwin",
): IpcApi {
  const api = makeIpcApi(overrides);
  Object.defineProperty(window, "api", { value: api, configurable: true });
  Object.defineProperty(window, "platform", { value: platform, configurable: true });
  return api;
}
