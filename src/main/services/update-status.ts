import type { NetworkLogEntry, UpdateStatus } from "@core";

/** What the mapper reports; the caller supplies the host and the timestamp. */
export type NetworkEvent = Omit<NetworkLogEntry, "id" | "at" | "host">;

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

function releaseDownloadBase(version: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/${REPO.owner}/${REPO.repo}/releases/download/${tag}`;
}

/** Direct download URL for the portable Windows asset of a released version. */
export function portableAssetUrl(version: string, arch: string = process.arch): string {
  return `${releaseDownloadBase(version)}/MLabel-${version}-${arch}-portable.exe`;
}

/** Direct download URL for the macOS dmg installer of a released version. */
export function dmgAssetUrl(version: string, arch: string = process.arch): string {
  return `${releaseDownloadBase(version)}/MLabel-${version}-${arch}.dmg`;
}

/**
 * Translate `autoUpdater` events into `UpdateStatus` pushes. Builds that can
 * self-install download automatically (so `update-available` becomes a
 * `downloading` 0%); builds that can't (`external`: Windows portable, or a macOS
 * app running outside /Applications) instead surface `available-external` with a
 * direct asset link built by `assetUrl`.
 */
export function wireUpdater(
  updater: UpdaterLike,
  opts: {
    external: boolean;
    assetUrl: (version: string) => string;
    send: (status: UpdateStatus) => void;
    /**
     * Optional sink for the network log. Kept as a callback so this mapper
     * stays pure and testable against a bare EventEmitter — the caller supplies
     * somewhere for the entries to go.
     */
    onEvent?: (event: NetworkEvent) => void;
  },
): void {
  const { external, assetUrl, send, onEvent } = opts;
  const note = (event: NetworkEvent): void => onEvent?.(event);
  updater.autoDownload = !external;
  updater.autoInstallOnAppQuit = !external;

  let version = "";

  updater.on("checking-for-update", () => {
    note({ kind: "update-check", label: "Check for updates", outcome: "started" });
    send({ kind: "checking" });
  });
  updater.on("update-not-available", () => {
    note({
      kind: "update-check",
      label: "Check for updates",
      outcome: "success",
      detail: "Up to date",
    });
    send({ kind: "up-to-date" });
  });
  updater.on("error", (err) => {
    note({
      kind: "update-check",
      label: "Check for updates",
      outcome: "error",
      detail: messageOf(err),
    });
    send({ kind: "error", message: messageOf(err) });
  });

  updater.on("update-available", (info) => {
    version = versionOf(info);
    note({
      kind: "update-check",
      label: "Check for updates",
      outcome: "success",
      detail: `${version} available`,
    });
    if (external) {
      send({ kind: "available-external", version, url: assetUrl(version) });
    } else {
      send({ kind: "downloading", version, percent: 0 });
    }
  });

  updater.on("download-progress", (progress) => {
    const percent = Math.round(numberOf(progress, "percent"));
    send({ kind: "downloading", version, percent });
  });

  updater.on("update-downloaded", (info) => {
    note({ kind: "update-download", label: "Download update", outcome: "success" });
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
