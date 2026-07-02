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

/** Called after the updater arms so the menu can enable "Check for Updates…". */
let _onArmed: (() => void) | null = null;

/** Register a callback to be invoked when the updater arms. */
export function onUpdatesArmed(cb: () => void): void {
  _onArmed = cb;
}

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
  _onArmed?.();
}

/** Quit and install a downloaded update (installable builds only). */
export function installUpdate(): void {
  electronUpdater.autoUpdater.quitAndInstall();
}

/**
 * Manually trigger an update check from the renderer (e.g. error-state retry).
 * No-op when updates were never armed — preserves the zero-network invariant.
 * Errors flow through the existing event→status broadcast (wired by wireUpdater).
 */
export function checkForUpdatesManually(): void {
  if (!started) return;
  void electronUpdater.autoUpdater.checkForUpdates();
}
