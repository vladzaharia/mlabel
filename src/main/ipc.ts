import { ipcMain, nativeTheme } from "electron";
import { IPC_INVOKE, type ExportRequest, type SessionData } from "@core";
import { getStartupConfig, pickConfig } from "./services/config-service";
import { exportLabels, loadInputFromPath, pickInput } from "./services/coordinator";
import { clearSession, getRecent, saveSession } from "./services/session-store";

/** Register every request-response IPC handler. One handler per IpcApi method. */
export function registerIpc(): void {
  ipcMain.handle(IPC_INVOKE.ping, () => "pong" as const);
  ipcMain.handle(IPC_INVOKE.getTheme, () => nativeTheme.shouldUseDarkColors);

  ipcMain.handle(IPC_INVOKE.getStartupConfig, () => getStartupConfig());
  ipcMain.handle(IPC_INVOKE.pickConfig, () => pickConfig());

  ipcMain.handle(IPC_INVOKE.pickInput, () => pickInput());
  ipcMain.handle(IPC_INVOKE.loadInput, (_event, path: string) => loadInputFromPath(path));

  ipcMain.handle(IPC_INVOKE.saveSession, (_event, data: SessionData) => saveSession(data));
  ipcMain.handle(IPC_INVOKE.clearSession, () => clearSession());

  ipcMain.handle(IPC_INVOKE.exportLabels, (_event, request: ExportRequest) =>
    exportLabels(request),
  );

  ipcMain.handle(IPC_INVOKE.getRecent, () => getRecent());
}
