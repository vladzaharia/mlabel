import { app, dialog } from "electron";

/**
 * Pure: should we offer to move the app into /Applications? Only for packaged
 * macOS builds running from outside /Applications — that's where Gatekeeper App
 * Translocation runs a quarantined zip from a read-only path, which blocks
 * in-place auto-update. Dev and other platforms are never prompted.
 */
export function shouldOfferRelocate(opts: {
  packaged: boolean;
  isMac: boolean;
  inApplicationsFolder: boolean;
}): boolean {
  return opts.packaged && opts.isMac && !opts.inApplicationsFolder;
}

/**
 * macOS: if running outside /Applications, offer to move there. Moving clears the
 * quarantine + translocation so auto-update can install in place. Returns true if
 * a move was started (Electron relaunches the app from its new location).
 */
export function offerRelocateToApplications(): boolean {
  const isMac = process.platform === "darwin";
  // `isInApplicationsFolder` is a macOS-only API; treat every other platform as
  // "in place" so the predicate below short-circuits before we ever call it.
  const inApplicationsFolder = isMac ? app.isInApplicationsFolder() : true;
  if (!shouldOfferRelocate({ packaged: app.isPackaged, isMac, inApplicationsFolder })) {
    return false;
  }

  const choice = dialog.showMessageBoxSync({
    type: "question",
    buttons: ["Move to Applications", "Not Now"],
    defaultId: 0,
    cancelId: 1,
    message: "Move MLabel to Applications?",
    detail:
      "MLabel is running from outside your Applications folder, which prevents " +
      "automatic updates from installing. Move it to Applications to enable updates.",
  });
  if (choice !== 0) return false;

  try {
    return app.moveToApplicationsFolder();
  } catch {
    return false;
  }
}
