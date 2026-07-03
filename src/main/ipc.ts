import { ipcMain, nativeTheme, shell } from "electron";
import {
  IPC_INVOKE,
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
import { clearSession, getRecent } from "./services/session-store";
import { isAllowedExternalUrl } from "./services/network-policy";
import { checkForUpdatesManually, installUpdate } from "./services/updater";
import { appState, isRevealable } from "./state";

/** Register every request-response IPC handler. One handler per IpcApi method. */
export function registerIpc(): void {
  ipcMain.handle(IPC_INVOKE.ping, () => "pong" as const);
  ipcMain.handle(IPC_INVOKE.getTheme, () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle(IPC_INVOKE.getStartupConfig, () => getStartupConfig());
  ipcMain.handle(IPC_INVOKE.pickConfig, () => pickConfig());

  ipcMain.handle(IPC_INVOKE.pickInput, () => pickInput());
  ipcMain.handle(IPC_INVOKE.loadInput, (_event, path: string) => loadInputFromPath(path));

  ipcMain.handle(IPC_INVOKE.saveSession, (_event, data: SessionData) => saveSessionStamped(data));
  ipcMain.handle(IPC_INVOKE.clearSession, () => clearSession());

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
    if (!isAllowedExternalUrl(url)) throw new Error(`Blocked non-release external URL: ${url}`);
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
