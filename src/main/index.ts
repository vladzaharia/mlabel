import { join } from "node:path";
import { app, BrowserWindow, nativeImage, nativeTheme, session } from "electron";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { IPC_EVENT } from "@core/ipc";
import { registerIpc } from "./ipc";
import { offerRelocateToApplications } from "./services/app-location";
import { installNetworkGuard } from "./services/network-guard";
// Bundled by electron-vite (?asset) so it's available at runtime in dev and in
// the packaged asar — keeps the icon identical across platforms and builds.
import appIcon from "../../build/icon.png?asset";

const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

function titleBarOverlayColors(): { color: string; symbolColor: string; height: number } {
  const dark = nativeTheme.shouldUseDarkColors;
  return {
    color: dark ? "#2d2d2d" : "#f7f7f7",
    symbolColor: dark ? "#e8e8e8" : "#1c1c1c",
    height: 44,
  };
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    show: false,
    icon: appIcon,
    // Translucent chrome: a transparent window background lets the OS material
    // (macOS vibrancy / Windows acrylic) show through the renderer's alpha
    // surfaces. Linux falls back to an opaque background.
    backgroundColor:
      isMac || !isLinux ? "#00000000" : nativeTheme.shouldUseDarkColors ? "#2c2c2c" : "#ffffff",
    // Frameless chrome that blends with our custom top app bar.
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 16, y: 14 },
          // Subtle, Zed-style window blur of whatever sits behind the window.
          vibrancy: "under-window" as const,
          visualEffectState: "active" as const,
        }
      : {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: titleBarOverlayColors(),
          ...(isLinux ? {} : { backgroundMaterial: "acrylic" as const }),
        }),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false, // ESM preload requires an unsandboxed preload
      nodeIntegration: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  return win;
}

/** Strict CSP for a zero-network local app; relaxed only for the Vite dev server. */
function installCsp(): void {
  const prod =
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; script-src 'self'; connect-src 'self'";
  const dev =
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: http://localhost:*";
  const policy = is.dev ? dev : prod;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy],
      },
    });
  });
}

function broadcastTheme(): void {
  const dark = nativeTheme.shouldUseDarkColors;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!isMac) win.setTitleBarOverlay(titleBarOverlayColors());
    win.webContents.send(IPC_EVENT.themeChanged, dark);
  }
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  electronApp.setAppUserModelId("gg.vlad.mlabel");

  // macOS: if launched from outside /Applications (e.g. a quarantined zip in
  // Downloads), offer to relocate before doing anything else — a move relaunches
  // the app, and it's what makes in-place auto-update possible.
  if (offerRelocateToApplications()) return;

  // Apply the app icon at runtime on macOS (dock) so it's identical in dev and
  // every packaged build, independent of the bundle's .icns.
  if (app.dock) app.dock.setIcon(nativeImage.createFromPath(appIcon));

  installCsp();
  installNetworkGuard();
  registerIpc();

  app.on("browser-window-created", (_event, win) => optimizer.watchWindowShortcuts(win));
  nativeTheme.on("updated", broadcastTheme);

  createWindow();
}

// Enforce single-instance. This must run before any userData write so the
// lock also guards the on-disk session file against cross-process write
// races (a durability workstream depends on this guarantee).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void bootstrap();
}

// Closing the window quits the app on every platform (including macOS).
app.on("window-all-closed", () => {
  app.quit();
});
