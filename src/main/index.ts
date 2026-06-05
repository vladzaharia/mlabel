import { join } from "node:path";
import { app, BrowserWindow, nativeTheme, session } from "electron";
import { electronApp, is, optimizer } from "@electron-toolkit/utils";
import { IPC_EVENT } from "@core/ipc";
import { registerIpc } from "./ipc";

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
  installCsp();
  registerIpc();

  app.on("browser-window-created", (_event, win) => optimizer.watchWindowShortcuts(win));
  nativeTheme.on("updated", broadcastTheme);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

void bootstrap();

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});
