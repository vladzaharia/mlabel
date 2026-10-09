import { app, session } from "electron";
import { isNavigationAllowed, isRequestAllowed } from "./network-policy";
import { networkLog } from "./network-log";

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
 *
 * Raw Node http/fetch from the main process would bypass webRequest; none
 * exists (CLAUDE.md golden rule 1) and none may be added.
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

/**
 * Must match electron-updater's internal `NET_SESSION_NAME` — it routes all of
 * its requests through this partition, never the default session. Guarded by a
 * contract test in network-policy.test.ts so an upgrade can't silently rename
 * it and leave updater traffic unfiltered.
 */
const UPDATER_PARTITION = "electron-updater";

/**
 * Model weights get their own partition so their traffic is judged under the
 * `model` scope alone — the updater session cannot reach Hugging Face and this
 * one cannot reach GitHub, so a bug in one cannot borrow the other's permission.
 */
const MODEL_PARTITION = "model-download";

/** Never throws on an unparseable URL — this runs on the request hot path. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}

function deny(url: string): void {
  console.warn("[network-policy] denied:", url);
  // Only denials are recorded here. Logging every *allowed* updater request
  // would fill the buffer with redirect hops and download chunks and evict the
  // one thing anyone opens this list to find.
  networkLog.record({
    kind: "denied",
    label: "Blocked request",
    host: hostOf(url),
    outcome: "denied",
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
  const updaterSession = session.fromPartition(UPDATER_PARTITION, { cache: false });
  updaterSession.webRequest.onBeforeRequest((details, callback) => {
    const cancel = !isRequestAllowed(details.url, {
      scope: "updater",
      updatesEnabled,
      modelDownloadEnabled: false,
      isDev,
    });
    if (cancel) deny(details.url);
    callback({ cancel });
  });

  const modelSession = session.fromPartition(MODEL_PARTITION, { cache: false });
  modelSession.webRequest.onBeforeRequest((details, callback) => {
    const cancel = !isRequestAllowed(details.url, {
      scope: "model",
      updatesEnabled: false,
      modelDownloadEnabled,
      isDev,
    });
    if (cancel) deny(details.url);
    callback({ cancel });
  });

  for (const s of [session.defaultSession, updaterSession, modelSession]) {
    s.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    s.setPermissionCheckHandler(() => false);
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
