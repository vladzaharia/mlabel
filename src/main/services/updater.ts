import { app, BrowserWindow } from "electron";
// electron-updater is CommonJS; the default import is the namespace object.
import electronUpdater from "electron-updater";
import { IPC_EVENT } from "@core/ipc";
import type { UpdateStatus } from "@core";
import { wireUpdater, type UpdaterLike } from "./update-status";

/** electron-builder sets this only when running a portable Windows build. */
function isPortable(): boolean {
  return Boolean(process.env["PORTABLE_EXECUTABLE_DIR"]);
}

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_EVENT.updateStatus, status);
  }
}

let started = false;

/**
 * Arm the auto-updater and run a first check. No-op in dev (updates need a
 * packaged app) and idempotent, so repeated config loads don't re-arm it.
 * Only ever called once a loaded config permits update checks.
 */
export function startUpdates(): void {
  if (started || !app.isPackaged) return;
  started = true;

  const { autoUpdater } = electronUpdater;
  autoUpdater.logger = console;
  wireUpdater(autoUpdater as unknown as UpdaterLike, {
    portable: isPortable(),
    send: broadcast,
  });
  void autoUpdater.checkForUpdates();
}

/** Quit and install a downloaded update (installable builds only). */
export function installUpdate(): void {
  electronUpdater.autoUpdater.quitAndInstall();
}
