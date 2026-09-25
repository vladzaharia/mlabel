/**
 * Pure network policy for the whole app: every Chromium-level request (renderer
 * session and electron-updater's session) and every navigation is checked here.
 * Zero Electron imports so the decisions are unit-testable; the wiring lives in
 * `network-guard.ts`.
 *
 * This app makes remote requests for exactly two things, each gated by its own
 * config flag and each confined to its own session:
 *
 * - the GitHub Releases update check for the pinned repo (`network.updateChecks`)
 * - downloading a model from Hugging Face (`network.modelDownload`)
 *
 * The scopes do not overlap. The updater session cannot reach Hugging Face and
 * the model session cannot reach GitHub, so a bug in one cannot borrow the
 * other's permission. Everything else, in every scope, is denied.
 */

export type NetworkScope = "renderer" | "updater" | "model";

export interface PolicyContext {
  scope: NetworkScope;
  updatesEnabled: boolean;
  /**
   * Required rather than optional, deliberately: a security control that
   * defaults to something when you forget it is a control you will forget.
   */
  modelDownloadEnabled: boolean;
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

/**
 * The host to show in the network log, for any string at all.
 *
 * Deliberately total: this runs on the request hot path and while *reporting* a
 * request that was already refused, so a URL too malformed to parse is an
 * ordinary input here, not an error. Falling back to a truncated prefix keeps
 * the log honest about something having been attempted rather than dropping the
 * entry — an unparseable URL is exactly the kind of thing a reader wants to see.
 */
export function hostOf(url: string): string {
  return parse(url)?.host ?? url.slice(0, 40);
}

function isCleanHttps(u: URL): boolean {
  return u.protocol === "https:" && u.username === "" && u.password === "" && u.port === "";
}

function isDevLoopback(u: URL, isDev: boolean): boolean {
  return (
    isDev && (u.protocol === "http:" || u.protocol === "ws:") && LOOPBACK_HOSTS.has(u.hostname)
  );
}

/**
 * Hosts Hugging Face serves model files from.
 *
 * Suffix-matched on `.hf.co` rather than pinned to a list, because HF resolves
 * a download to one of well over a dozen regional CDN hosts and documents that
 * the set changes — a pinned list would start failing for users in a region we
 * did not anticipate, fixable only by shipping a release. The dot is what makes
 * the suffix safe: without it `evilhf.co` would match.
 */
const HF_HOSTS = new Set(["huggingface.co", "hf.co"]);

function isHuggingFace(u: URL): boolean {
  if (!isCleanHttps(u)) return false;
  return HF_HOSTS.has(u.hostname) || u.hostname.endsWith(".hf.co");
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
  if (ctx.scope === "updater") return ctx.updatesEnabled && isGithubRelease(u);
  if (ctx.scope === "model") return ctx.modelDownloadEnabled && isHuggingFace(u);
  return false;
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
