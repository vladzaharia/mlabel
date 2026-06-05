import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_EVENT, IPC_INVOKE, type IpcApi, type ThemeListener } from "@core/ipc";
import type { ExportRequest, SessionData } from "@core";

const api = {
  ping: () => ipcRenderer.invoke(IPC_INVOKE.ping),

  getTheme: () => ipcRenderer.invoke(IPC_INVOKE.getTheme),
  onThemeChange: (listener: ThemeListener) => {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean): void => listener(isDark);
    ipcRenderer.on(IPC_EVENT.themeChanged, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT.themeChanged, handler);
  },

  getStartupConfig: () => ipcRenderer.invoke(IPC_INVOKE.getStartupConfig),
  pickConfig: () => ipcRenderer.invoke(IPC_INVOKE.pickConfig),

  pickInput: () => ipcRenderer.invoke(IPC_INVOKE.pickInput),
  loadInput: (path: string) => ipcRenderer.invoke(IPC_INVOKE.loadInput, path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),

  saveSession: (data: SessionData) => ipcRenderer.invoke(IPC_INVOKE.saveSession, data),
  clearSession: () => ipcRenderer.invoke(IPC_INVOKE.clearSession),

  exportLabels: (request: ExportRequest) => ipcRenderer.invoke(IPC_INVOKE.exportLabels, request),

  getRecent: () => ipcRenderer.invoke(IPC_INVOKE.getRecent),
} satisfies IpcApi;

contextBridge.exposeInMainWorld("api", api);
