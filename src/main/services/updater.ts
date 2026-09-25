import { app, BrowserWindow } from "electron";
// electron-updater is CommonJS; the default import is the namespace object.
import electronUpdater from "electron-updater";
import { IPC_EVENT } from "@core/ipc";
import type { UpdateStatus } from "@core";
import { wireUpdater, dmgAssetUrl, portableAssetUrl, type UpdaterLike } from "./update-status";
import { networkLog } from "./network-log";

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
  // An unpackaged checkout has nothing to swap out. Saying so here rather than
  // at the call site is what lets a dev run check for updates like any other
  // build and simply be offered a download link instead of an install.
  if (!app.isPackaged) return false;
  if (isPortable()) return false;
  if (isMac && !app.isInApplicationsFolder()) return false;
  return true;
}

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_EVENT.updateStatus, status);
  }
}

/** The one host updater traffic is ever allowed to reach. */
const UPDATE_HOST = "github.com";

let started = false;

/**
 * Whether checks are permitted right now.
 *
 * Separate from `started`, and that separation is the point. Turning checks off
 * closes the request gate immediately, but electron-updater's listeners stay
 * wired and its in-flight request dies as `ERR_BLOCKED_BY_CLIENT` — surfacing
 * as a red error the labeler did not cause. This flag lets that be suppressed
 * and reported as what it is.
 */
let allowed = true;

/**
 * Permit or forbid update checks at runtime.
 *
 * Turning them back on re-checks rather than re-arming: `started` is one-way
 * because tearing down electron-updater's listeners is not a supported
 * operation, so an off→on cycle would otherwise be a silent no-op.
 */
export function setUpdatesAllowed(value: boolean): void {
  if (allowed === value) return;
  allowed = value;
  if (!value) {
    broadcast({ kind: "disabled" });
    return;
  }
  if (started) checkForUpdatesManually();
  else startUpdates();
}

/** Whether the updater ever armed. Drives the menu item and the settings pane. */
export const isUpdatesArmed = (): boolean => started;

/** Called after the updater arms so the menu can enable "Check for Updates…". */
let _onArmed: (() => void) | null = null;

/** Register a callback to be invoked when the updater arms. */
export function onUpdatesArmed(cb: () => void): void {
  _onArmed = cb;
}

/**
 * Arm the auto-updater and run a first check. Idempotent, so repeated config
 * loads don't re-arm it. Only ever called once a loaded config permits update
 * checks.
 *
 * **Development builds check too.** electron-updater skips an unpackaged app by
 * default, which left the network log empty in dev and forced a parenthetical
 * explaining why — a panel whose whole job is to show what the app contacted,
 * saying "not here, trust the packaged build". The check itself is an ordinary
 * HTTPS request and runs identically either way; only *installing* needs a
 * packaged app, and that is gated separately. So dev makes the same request,
 * through the same gate, and it appears in the same log.
 */
export function startUpdates(): void {
  if (started || !allowed) return;
  started = true;

  const { autoUpdater } = electronUpdater;
  autoUpdater.logger = console;
  // Reads `dev-app-update.yml` at the project root for the publish config that
  // an installer would otherwise carry in its own metadata. `canSelfUpdate` is
  // already false here, so the check runs and the result is a download link.
  if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
  wireUpdater(autoUpdater as unknown as UpdaterLike, {
    external: !canSelfUpdate(),
    assetUrl: isMac ? dmgAssetUrl : portableAssetUrl,
    send: (status) => {
      // A request cancelled by our own gate is not a failure worth alarming
      // anyone about — it is the setting doing exactly what it says.
      if (!allowed && status.kind === "error") return;
      broadcast(status);
    },
    onEvent: (event) => networkLog.record({ ...event, host: UPDATE_HOST }),
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
  if (!allowed) {
    // Explaining the no-op beats a button that appears to do nothing.
    networkLog.record({
      kind: "update-check",
      label: "Check for updates",
      host: UPDATE_HOST,
      outcome: "denied",
      detail: "Update checks are turned off",
    });
    broadcast({ kind: "disabled" });
    return;
  }
  void electronUpdater.autoUpdater.checkForUpdates();
}
