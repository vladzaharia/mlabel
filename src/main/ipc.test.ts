import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_INVOKE } from "@core/ipc";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  config: null as null | { network: { updateChecks: boolean } },
  settings: { updateChecks: true },
  setUpdatesEnabled: vi.fn(),
  setUpdatesAllowed: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getVersion: () => "0.4.0", isPackaged: true },
  ipcMain: {
    handle: (name: string, handler: (...args: any[]) => any) => mocks.handlers.set(name, handler),
  },
  nativeTheme: {},
  shell: {},
}));
vi.mock("./menu", () => ({ updateMenuContext: vi.fn() }));
vi.mock("./services/config-service", () => ({ getStartupConfig: vi.fn(), pickConfig: vi.fn() }));
vi.mock("./services/coordinator", () => ({
  exportLabels: vi.fn(),
  loadInputFromPath: vi.fn(),
  pickInput: vi.fn(),
  saveSessionStamped: vi.fn(),
}));
vi.mock("./services/prepare-service", () => ({
  analyzeJoinFiles: vi.fn(),
  analyzeSplitFile: vi.fn(),
  pickJoinFiles: vi.fn(),
  pickPrepareFiles: vi.fn(),
  pickSplitFile: vi.fn(),
  runJoin: vi.fn(),
  runSplit: vi.fn(),
}));
vi.mock("./services/session-store", () => ({
  clearSession: vi.fn(),
  getRecent: vi.fn(),
  readSessionRaw: vi.fn(),
}));
vi.mock("./services/updater", () => ({
  checkForUpdatesManually: vi.fn(),
  installUpdate: vi.fn(),
  isUpdatesArmed: () => false,
  setUpdatesAllowed: mocks.setUpdatesAllowed,
}));
vi.mock("./services/network-guard", () => ({ setUpdatesEnabled: mocks.setUpdatesEnabled }));
vi.mock("./services/network-log", () => ({ networkLog: { entries: () => [] } }));
vi.mock("./services/settings-store", () => ({
  getSettings: () => mocks.settings,
  setSettings: (patch: object) => (mocks.settings = { ...mocks.settings, ...patch }),
  resetSettings: () => (mocks.settings = { updateChecks: true }),
}));
vi.mock("./state", () => ({
  appState: {
    get config() {
      return mocks.config;
    },
  },
  isRevealable: vi.fn(),
}));
vi.mock("./services/ai/model-log", () => ({ modelLog: { entries: () => [] } }));
vi.mock("./services/ai/ai-service", () => ({
  aiStatus: vi.fn(),
  cancelDownload: vi.fn(),
  configAllowsAi: () => true,
  configAllowsDownload: () => true,
  deleteModel: vi.fn(),
  startDownload: vi.fn(),
}));
vi.mock("./services/ai/analysis-service", () => ({ setIndex: vi.fn() }));
import { registerIpc } from "./ipc";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  mocks.config = null;
  mocks.settings = { updateChecks: true };
  registerIpc();
});

describe("settings update policy through IPC", () => {
  it("cannot enable traffic before a config is loaded", () => {
    mocks.handlers.get(IPC_INVOKE.setSettings)!(null, { updateChecks: true });
    expect(mocks.setUpdatesEnabled).toHaveBeenCalledWith(false);
    expect(mocks.setUpdatesAllowed).toHaveBeenCalledWith(false);
  });
  it("respects a config that forbids updates", () => {
    mocks.config = { network: { updateChecks: false } };
    mocks.handlers.get(IPC_INVOKE.setSettings)!(null, { updateChecks: true });
    expect(mocks.setUpdatesEnabled).toHaveBeenCalledWith(false);
  });
  it("applies reset preferences to the live network policy", () => {
    mocks.config = { network: { updateChecks: true } };
    mocks.settings = { updateChecks: false };
    mocks.handlers.get(IPC_INVOKE.resetSettings)!(null);
    expect(mocks.setUpdatesEnabled).toHaveBeenCalledWith(true);
    expect(mocks.setUpdatesAllowed).toHaveBeenCalledWith(true);
  });
});
