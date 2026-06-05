import { contextBridge, ipcRenderer } from "electron";
import { IPC_EVENT, IPC_INVOKE, type IpcApi, type ThemeListener } from "@core/ipc";

const api = {
  ping: () => ipcRenderer.invoke(IPC_INVOKE.ping),
  getTheme: () => ipcRenderer.invoke(IPC_INVOKE.getTheme),
  onThemeChange: (listener: ThemeListener) => {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean): void => listener(isDark);
    ipcRenderer.on(IPC_EVENT.themeChanged, handler);
    return () => ipcRenderer.removeListener(IPC_EVENT.themeChanged, handler);
  },
} satisfies IpcApi;

contextBridge.exposeInMainWorld("api", api);
