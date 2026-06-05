import type { UpdateStatus } from "@core";

/**
 * The slice of electron-updater's `autoUpdater` this module touches. Kept as a
 * structural interface (no `electron-updater` import) so the event→status
 * mapping can be unit-tested against a plain EventEmitter, with no Electron.
 */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

const REPO = { owner: "vladzaharia", repo: "mlabel" } as const;

/** Direct download URL for the portable Windows asset of a released version. */
export function portableAssetUrl(version: string, arch: string = process.arch): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/${REPO.owner}/${REPO.repo}/releases/download/${tag}/MLabel-${version}-${arch}-portable.exe`;
}

/**
 * Translate `autoUpdater` events into `UpdateStatus` pushes. Installable builds
 * download automatically (so `update-available` becomes a `downloading` 0%);
 * portable builds can't self-install, so `update-available` becomes
 * `available-external` with a direct asset link.
 */
export function wireUpdater(
  updater: UpdaterLike,
  opts: { portable: boolean; send: (status: UpdateStatus) => void },
): void {
  const { portable, send } = opts;
  updater.autoDownload = !portable;
  updater.autoInstallOnAppQuit = !portable;

  let version = "";

  updater.on("checking-for-update", () => send({ kind: "checking" }));
  updater.on("update-not-available", () => send({ kind: "up-to-date" }));
  updater.on("error", (err) => send({ kind: "error", message: messageOf(err) }));

  updater.on("update-available", (info) => {
    version = versionOf(info);
    if (portable) {
      send({ kind: "available-external", version, url: portableAssetUrl(version) });
    } else {
      send({ kind: "downloading", version, percent: 0 });
    }
  });

  updater.on("download-progress", (progress) => {
    const percent = Math.round(numberOf(progress, "percent"));
    send({ kind: "downloading", version, percent });
  });

  updater.on("update-downloaded", (info) => {
    send({ kind: "downloaded", version: versionOf(info) || version });
  });
}

function versionOf(info: unknown): string {
  return typeof info === "object" &&
    info !== null &&
    typeof (info as { version?: unknown }).version === "string"
    ? (info as { version: string }).version
    : "";
}

function messageOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : undefined;
}

function numberOf(value: unknown, key: string): number {
  const n =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : 0;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
