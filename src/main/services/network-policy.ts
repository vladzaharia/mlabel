/**
 * Pure network policy for the whole app: every Chromium-level request (renderer
 * session and electron-updater's session) and every navigation is checked here.
 * Zero Electron imports so the decisions are unit-testable; the wiring lives in
 * `network-guard.ts`.
 *
 * The only remote traffic this app is ever allowed to make is the GitHub
 * Releases update check for the pinned repo — and only while a loaded config
 * permits it (`network.updateChecks`). Everything else is denied.
 */

export type NetworkScope = "renderer" | "updater";

export interface PolicyContext {
  scope: NetworkScope;
  updatesEnabled: boolean;
  isDev: boolean;
}

const REPO_RELEASES_PATH = /^\/vladzaharia\/mlabel\/releases(\.atom)?(\/|$)/;

/**
 * Hosts GitHub redirects release downloads to. Asset URLs there are opaque
 * signed CDN paths, so host-level matching is the finest feasible granularity.
 */
const GITHUB_ASSET_HOSTS = new Set([
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
]);

/** Schemes that never touch the network; always safe to let through. */
const LOCAL_SCHEMES = new Set([
  "file:",
  "devtools:",
  "data:",
  "blob:",
  "about:",
  "chrome-extension:",
  "chrome:",
]);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parse(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function isCleanHttps(u: URL): boolean {
  return u.protocol === "https:" && u.username === "" && u.password === "" && u.port === "";
}

function isDevLoopback(u: URL, isDev: boolean): boolean {
  return (
    isDev && (u.protocol === "http:" || u.protocol === "ws:") && LOOPBACK_HOSTS.has(u.hostname)
  );
}

function isGithubRelease(u: URL): boolean {
  if (!isCleanHttps(u)) return false;
  if (u.hostname === "github.com") return REPO_RELEASES_PATH.test(u.pathname);
  return GITHUB_ASSET_HOSTS.has(u.hostname);
}

/** Should this Chromium-level request be allowed to proceed? */
export function isRequestAllowed(url: string, ctx: PolicyContext): boolean {
  const u = parse(url);
  if (!u) return false;
  if (LOCAL_SCHEMES.has(u.protocol)) return true;
  if (isDevLoopback(u, ctx.isDev)) return true;
  return ctx.scope === "updater" && ctx.updatesEnabled && isGithubRelease(u);
}

/** Should the window be allowed to navigate to this URL? */
export function isNavigationAllowed(url: string, ctx: { isDev: boolean }): boolean {
  const u = parse(url);
  if (!u) return false;
  if (u.protocol === "file:" || u.protocol === "devtools:") return true;
  return isDevLoopback(u, ctx.isDev);
}

/** May this URL be handed to `shell.openExternal`? Release pages/assets only. */
export function isAllowedExternalUrl(url: string): boolean {
  const u = parse(url);
  if (!u) return false;
  return isCleanHttps(u) && u.hostname === "github.com" && REPO_RELEASES_PATH.test(u.pathname);
}
