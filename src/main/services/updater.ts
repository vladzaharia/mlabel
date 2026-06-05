import { app, BrowserWindow } from "electron";
// electron-updater is CommonJS; the default import is the namespace object.
import electronUpdater from "electron-updater";
import { IPC_EVENT } from "@core/ipc";
import type { UpdateStatus } from "@core";
import { wireUpdater, dmgAssetUrl, portableAssetUrl, type UpdaterLike } from "./update-status";

const isMac = process.platform === "darwin";

/** electron-builder sets this only when running a portable Windows build. */
function isPortable(): boolean {
  return Boolean(process.env["PORTABLE_EXECUTABLE_DIR"]);
}

/**
 * Whether this install can replace itself in place. A Windows portable .exe never
 * can; a macOS app running outside /Applications can't either — Gatekeeper runs a
 * quarantined zip from a read-only translocated path, so Squirrel.Mac's in-place
 * swap fails after download. Those cases fall back to a manual download link.
 */
function canSelfUpdate(): boolean {
  if (isPortable()) return false;
  if (isMac && !app.isInApplicationsFolder()) return false;
  return true;
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
    external: !canSelfUpdate(),
    assetUrl: isMac ? dmgAssetUrl : portableAssetUrl,
    send: broadcast,
  });
  void autoUpdater.checkForUpdates();
}

/** Quit and install a downloaded update (installable builds only). */
export function installUpdate(): void {
  electronUpdater.autoUpdater.quitAndInstall();
}
