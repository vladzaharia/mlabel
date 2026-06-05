import type { IpcApi } from "@core/ipc";

declare global {
  interface Window {
    api: IpcApi;
    platform: NodeJS.Platform;
  }
}

export {};
