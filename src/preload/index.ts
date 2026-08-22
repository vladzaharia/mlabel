import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  IPC_EVENT,
  IPC_INVOKE,
  type IpcApi,
  type SetModeListener,
  type ThemeListener,
  type UpdateStatusListener,
} from "@core/ipc";
import type {
  ExportRequest,
  JoinKind,
  JoinRequest,
  SessionData,
  SplitRequest,
  UpdateStatus,
} from "@core";

const api = {
  ping: () => ipcRenderer.invoke(IPC_INVOKE.ping),

  getTheme: () => ipcRenderer.invoke(IPC_INVOKE.getTheme),
  onThemeChange: (listener: ThemeListener) => {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean): void => listener(isDark);
    ipcRenderer.on(IPC_EVENT.themeChanged, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT.themeChanged, handler);
  },

  onUpdateStatus: (listener: UpdateStatusListener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
      listener(status);
    ipcRenderer.on(IPC_EVENT.updateStatus, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT.updateStatus, handler);
  },
  onSetMode: (listener: SetModeListener) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: "label" | "prepare"): void =>
      listener(mode);
    ipcRenderer.on(IPC_EVENT.setMode, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT.setMode, handler);
  },
  setMenuContext: (ctx: { configLoaded: boolean; mode: "label" | "prepare" }) =>
    ipcRenderer.invoke(IPC_INVOKE.setMenuContext, ctx),
  installUpdate: () => ipcRenderer.invoke(IPC_INVOKE.installUpdate),
  checkForUpdates: () => ipcRenderer.invoke(IPC_INVOKE.checkForUpdates),
  openExternal: (url: string) => ipcRenderer.invoke(IPC_INVOKE.openExternal, url),
  revealPath: (path: string) => ipcRenderer.invoke(IPC_INVOKE.revealPath, path),

  getStartupConfig: () => ipcRenderer.invoke(IPC_INVOKE.getStartupConfig),
  pickConfig: () => ipcRenderer.invoke(IPC_INVOKE.pickConfig),

  pickInput: () => ipcRenderer.invoke(IPC_INVOKE.pickInput),
  loadInput: (path: string) => ipcRenderer.invoke(IPC_INVOKE.loadInput, path),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  unloadInput: () => ipcRenderer.invoke(IPC_INVOKE.unloadInput),
  unloadConfig: () => ipcRenderer.invoke(IPC_INVOKE.unloadConfig),

  saveSession: (data: SessionData) => ipcRenderer.invoke(IPC_INVOKE.saveSession, data),
  clearSession: () => ipcRenderer.invoke(IPC_INVOKE.clearSession),

  exportLabels: (request: ExportRequest) => ipcRenderer.invoke(IPC_INVOKE.exportLabels, request),

  getRecent: () => ipcRenderer.invoke(IPC_INVOKE.getRecent),

  pickSplitFile: () => ipcRenderer.invoke(IPC_INVOKE.pickSplitFile),
  pickPrepareFiles: () => ipcRenderer.invoke(IPC_INVOKE.pickPrepareFiles),
  analyzeSplitFile: (path: string) => ipcRenderer.invoke(IPC_INVOKE.analyzeSplitFile, path),
  runSplit: (request: SplitRequest) => ipcRenderer.invoke(IPC_INVOKE.runSplit, request),
  pickJoinFiles: (kind: JoinKind) => ipcRenderer.invoke(IPC_INVOKE.pickJoinFiles, kind),
  analyzeJoinFiles: (request: JoinRequest) =>
    ipcRenderer.invoke(IPC_INVOKE.analyzeJoinFiles, request),
  runJoin: (request: JoinRequest) => ipcRenderer.invoke(IPC_INVOKE.runJoin, request),
} satisfies IpcApi;

contextBridge.exposeInMainWorld("api", api);
contextBridge.exposeInMainWorld("platform", process.platform);
