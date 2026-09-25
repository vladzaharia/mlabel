import { app, ipcMain, nativeTheme, shell } from "electron";
import {
  IPC_INVOKE,
  type AppSettings,
  type ExportRequest,
  type JoinKind,
  type JoinRequest,
  type SessionData,
  type SplitRequest,
} from "@core";
import { updateMenuContext } from "./menu";
import { getStartupConfig, pickConfig } from "./services/config-service";
import {
  exportLabels,
  loadInputFromPath,
  pickInput,
  saveSessionStamped,
} from "./services/coordinator";
import {
  analyzeJoinFiles,
  analyzeSplitFile,
  pickJoinFiles,
  pickPrepareFiles,
  pickSplitFile,
  runJoin,
  runSplit,
} from "./services/prepare-service";
import { clearSession, getRecent, readSessionRaw } from "./services/session-store";
import { hostOf, isAllowedExternalUrl } from "./services/network-policy";
import {
  checkForUpdatesManually,
  installUpdate,
  isUpdatesArmed,
  setUpdatesAllowed,
} from "./services/updater";
import { getSettings, resetSettings, setSettings } from "./services/settings-store";
import { setUpdatesEnabled } from "./services/network-guard";
import { networkLog } from "./services/network-log";
import { modelLog } from "./services/ai/model-log";
import { effectiveUpdateChecks, isPlatformSupported } from "@core";
import {
  aiStatus,
  cancelDownload,
  configAllowsAi,
  configAllowsDownload,
  deleteModel,
  startDownload,
} from "./services/ai/ai-service";
import { setIndex as setAiIndex } from "./services/ai/analysis-service";
import { appState, isRevealable } from "./state";

/** Register every request-response IPC handler. One handler per IpcApi method. */
export function registerIpc(): void {
  ipcMain.handle(IPC_INVOKE.ping, () => "pong" as const);
  ipcMain.handle(IPC_INVOKE.getTheme, () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle(IPC_INVOKE.getStartupConfig, () => getStartupConfig());
  ipcMain.handle(IPC_INVOKE.pickConfig, () => pickConfig());

  ipcMain.handle(IPC_INVOKE.pickInput, () => pickInput());
  ipcMain.handle(IPC_INVOKE.loadInput, (_event, path: string) => loadInputFromPath(path));
  ipcMain.handle(IPC_INVOKE.unloadInput, () => appState.clearInput());
  ipcMain.handle(IPC_INVOKE.unloadConfig, () => appState.clearConfig());

  ipcMain.handle(IPC_INVOKE.saveSession, (_event, data: SessionData) => saveSessionStamped(data));
  ipcMain.handle(IPC_INVOKE.clearSession, () => clearSession());
  ipcMain.handle(IPC_INVOKE.getSessionInfo, () => readSessionRaw());

  ipcMain.handle(IPC_INVOKE.getAppInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    updatesArmed: isUpdatesArmed(),
    updatesAllowedByConfig: appState.config?.network.updateChecks !== false,
    aiAllowedByConfig: configAllowsAi(),
    modelDownloadAllowedByConfig: configAllowsDownload(),
    aiPlatformSupported: isPlatformSupported(process.platform, process.arch),
  }));
  ipcMain.handle(IPC_INVOKE.getSettings, () => getSettings());
  ipcMain.handle(IPC_INVOKE.setSettings, (_event, patch: Partial<AppSettings>) => {
    const settings = setSettings(patch);
    // One write path, so the gate can never drift from what is on disk. The
    // config stays the floor: a preference may narrow it, never widen it.
    if (patch.updateChecks !== undefined) {
      const configAllows = appState.config?.network.updateChecks !== false;
      const allowed = effectiveUpdateChecks(configAllows, settings.updateChecks);
      setUpdatesEnabled(allowed);
      setUpdatesAllowed(allowed);
    }
    return settings;
  });
  ipcMain.handle(IPC_INVOKE.resetSettings, () => resetSettings());

  ipcMain.handle(IPC_INVOKE.getNetworkLog, () => [...networkLog.entries()]);
  ipcMain.handle(IPC_INVOKE.getModelLog, () => [...modelLog.entries()]);

  ipcMain.handle(IPC_INVOKE.getAiStatus, () => aiStatus());
  ipcMain.handle(IPC_INVOKE.downloadModel, (_event, modelId: string) => startDownload(modelId));
  ipcMain.handle(IPC_INVOKE.cancelModelDownload, () => {
    cancelDownload();
  });
  ipcMain.handle(IPC_INVOKE.deleteModel, (_event, modelId: string) => deleteModel(modelId));
  ipcMain.handle(IPC_INVOKE.setAiIndex, (_event, index: number) => {
    setAiIndex(index);
  });

  ipcMain.handle(IPC_INVOKE.exportLabels, (_event, request: ExportRequest) =>
    exportLabels(request),
  );

  ipcMain.handle(IPC_INVOKE.getRecent, () => getRecent());

  ipcMain.handle(IPC_INVOKE.pickSplitFile, () => pickSplitFile());
  ipcMain.handle(IPC_INVOKE.pickPrepareFiles, () => pickPrepareFiles());
  ipcMain.handle(IPC_INVOKE.analyzeSplitFile, (_event, path: string) => analyzeSplitFile(path));
  ipcMain.handle(IPC_INVOKE.runSplit, (_event, request: SplitRequest) => runSplit(request));
  ipcMain.handle(IPC_INVOKE.pickJoinFiles, (_event, kind: JoinKind) => pickJoinFiles(kind));
  ipcMain.handle(IPC_INVOKE.analyzeJoinFiles, (_event, request: JoinRequest) =>
    analyzeJoinFiles(request),
  );
  ipcMain.handle(IPC_INVOKE.runJoin, (_event, request: JoinRequest) => runJoin(request));

  ipcMain.handle(IPC_INVOKE.installUpdate, () => installUpdate());
  ipcMain.handle(IPC_INVOKE.checkForUpdates, () => checkForUpdatesManually());
  ipcMain.handle(IPC_INVOKE.openExternal, (_event, url: string) => {
    // Defense in depth: only main-built release URLs may leave the app.
    if (!isAllowedExternalUrl(url)) {
      // A refusal here is the same event as a refusal at `webRequest`, and a
      // reader of the log should not have to know which layer caught it.
      networkLog.record({
        kind: "denied",
        label: "Blocked request",
        host: hostOf(url),
        outcome: "denied",
      });
      throw new Error(`Blocked non-release external URL: ${url}`);
    }
    // Handing a URL to the OS browser is egress by any reasonable reading: the
    // machine contacts GitHub because the labeler clicked something in this app.
    // It leaves through the OS rather than through `webRequest`, so nothing else
    // would ever record it, and a network panel that stayed empty here would be
    // quietly lying about what the app caused.
    networkLog.record({
      kind: "update-download",
      label: "Open release page",
      host: hostOf(url),
      outcome: "success",
    });
    return shell.openExternal(url);
  });
  ipcMain.handle(IPC_INVOKE.revealPath, (_event, path: string) => {
    if (!isRevealable(path, appState.revealablePaths)) {
      throw new Error(`Blocked reveal of non-produced path: ${path}`);
    }
    shell.showItemInFolder(path);
  });

  ipcMain.handle(
    IPC_INVOKE.setMenuContext,
    (_event, ctx: { configLoaded: boolean; mode: "label" | "prepare" }) => {
      updateMenuContext({ configLoaded: ctx.configLoaded, mode: ctx.mode });
    },
  );
}
