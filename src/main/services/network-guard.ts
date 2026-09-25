import { app, session } from "electron";
import { hostOf, isNavigationAllowed, isRequestAllowed } from "./network-policy";
import { networkLog } from "./network-log";
import { MODEL_PARTITION, PARTITION_OPTIONS, UPDATER_PARTITION } from "./partitions";

/**
 * Hard enforcement of the zero-network rule (thin Electron wiring around the
 * pure policy in `network-policy.ts`). Layered guarantees:
 *
 * - defaultSession webRequest: the renderer can never reach a remote host,
 *   regardless of CSP. Dev builds may reach the local Vite server only.
 * - "electron-updater" partition webRequest: all updater traffic (check,
 *   channel file, downloads, every redirect hop) is limited to the GitHub
 *   release endpoints, and fully denied until a loaded config permits updates.
 * - Navigation/window-open/permission handlers: the window can't navigate to
 *   or open remote origins, and no permission request is ever granted.
 * - Spellchecker: disabled off macOS, because Chromium fetches its dictionaries
 *   below `webRequest` where none of the above can see it.
 *
 * Raw Node http/fetch from the main process would bypass webRequest; none
 * exists (CLAUDE.md golden rule 1), an oxlint rule now refuses the imports that
 * would allow it, and none may be added.
 *
 * Two things still leave the machine without passing through here, and the docs
 * say so rather than overclaiming: `shell.openExternal` hands a URL to the OS
 * browser (guarded by `isAllowedExternalUrl` and logged at its IPC handler), and
 * Chromium's own certificate-revocation and DNS lookups sit below Electron's
 * networking layer entirely.
 */

// Hard-deny updater traffic until a config that permits updates has loaded.
let updatesEnabled = false;

/** Flip the updater-traffic gate; read at request time, so it applies live. */
export function setUpdatesEnabled(value: boolean): void {
  updatesEnabled = value;
}

// Likewise for model weights: denied until a config permits them.
let modelDownloadEnabled = false;

/** Flip the model-download gate; read at request time, so it applies live. */
export function setModelDownloadEnabled(value: boolean): void {
  modelDownloadEnabled = value;
}

function deny(url: string): void {
  console.warn("[network-policy] denied:", url);
  networkLog.record({
    kind: "denied",
    label: "Blocked request",
    host: hostOf(url),
    outcome: "denied",
  });
}

/**
 * Hosts already recorded, as `scope:host`.
 *
 * Logging every allowed request would fill a 50-entry buffer with redirect hops
 * and download chunks and evict the one thing anyone opens this list to find.
 * Logging none of them — the previous behaviour — left the log naming only the
 * hosts the app *intended* to contact, which for both scopes is not the host
 * that served the bytes: `huggingface.co` redirects to a regional `*.hf.co`, and
 * a GitHub release redirects to its asset host.
 *
 * Recording the first request per host is the useful middle: every distinct host
 * the app actually spoke to appears exactly once, and a thousand chunks add
 * nothing. Deliberately never cleared — over a session, "did this app ever
 * contact X" is the question being asked, and re-answering it per chunk is what
 * we are avoiding.
 */
const contacted = new Set<string>();

/**
 * Record a host the app is about to open a request to, once.
 *
 * Only for scopes that reach a remote host. Allowed `renderer` traffic is
 * `file:`/`devtools:` and, in dev, the Vite server — logging that would be noise
 * about the app loading itself.
 */
function noteContact(scope: "updater" | "model", url: string): void {
  const host = hostOf(url);
  const key = `${scope}:${host}`;
  if (contacted.has(key)) return;
  contacted.add(key);
  networkLog.record({
    kind: "contacted",
    label: scope === "updater" ? "Contacted for updates" : "Contacted for weights",
    host,
    outcome: "success",
  });
}

/** Install every network guard. Call once, after app ready, before windows. */
export function installNetworkGuard(): void {
  const isDev = !app.isPackaged;

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const cancel = !isRequestAllowed(details.url, {
      scope: "renderer",
      updatesEnabled: false,
      modelDownloadEnabled: false,
      isDev,
    });
    if (cancel) deny(details.url);
    callback({ cancel });
  });

  // Options must match electron-updater's own `fromPartition` call so the
  // session it later grabs is this exact one.
  const updaterSession = session.fromPartition(UPDATER_PARTITION, PARTITION_OPTIONS);
  updaterSession.webRequest.onBeforeRequest((details, callback) => {
    const cancel = !isRequestAllowed(details.url, {
      scope: "updater",
      updatesEnabled,
      modelDownloadEnabled: false,
      isDev,
    });
    if (cancel) deny(details.url);
    else noteContact("updater", details.url);
    callback({ cancel });
  });

  const modelSession = session.fromPartition(MODEL_PARTITION, PARTITION_OPTIONS);
  modelSession.webRequest.onBeforeRequest((details, callback) => {
    const cancel = !isRequestAllowed(details.url, {
      scope: "model",
      updatesEnabled: false,
      modelDownloadEnabled,
      isDev,
    });
    if (cancel) deny(details.url);
    else noteContact("model", details.url);
    callback({ cancel });
  });

  for (const s of [session.defaultSession, updaterSession, modelSession]) {
    s.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    s.setPermissionCheckHandler(() => false);
  }

  // The one egress Chromium performs below `webRequest`: the bundled
  // spellchecker fetches Hunspell dictionaries from redirector.gvt1.com through
  // a browser-process loader, so no handler above would ever see it. Windows
  // already pass `spellcheck: isMac`; this closes the same door at the session,
  // so a window created without that preference cannot reopen it.
  //
  // Skipped on macOS, where the OS spellchecker is used and nothing is
  // downloaded — there the feature costs nothing and stays on.
  if (process.platform !== "darwin") {
    session.defaultSession.setSpellCheckerEnabled(false);
  }

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isNavigationAllowed(url, { isDev })) {
        deny(url);
        event.preventDefault();
      }
    });
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}
