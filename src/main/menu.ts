import type { MenuItemConstructorOptions } from "electron";

export interface MenuHandlers {
  onSetMode: (mode: "label" | "prepare") => void;
  onCheckForUpdates: () => void;
}

export interface MenuContext {
  isMac: boolean;
  isDev: boolean;
  configLoaded: boolean;
  mode: "label" | "prepare";
  updatesArmed: boolean;
}

/**
 * Build the full application menu template.
 *
 * Pure function — takes no Electron runtime references, so it can be exercised
 * in Node-only tests without a renderer or BrowserWindow.
 */
export function buildMenuTemplate(
  opts: MenuContext,
  handlers: MenuHandlers,
): MenuItemConstructorOptions[] {
  const { isMac, isDev, configLoaded, mode, updatesArmed } = opts;

  const modeMenu: MenuItemConstructorOptions = {
    label: "Mode",
    submenu: [
      {
        id: "mode-label",
        label: "Label Data",
        type: "radio",
        checked: mode === "label",
        enabled: configLoaded,
        accelerator: "CmdOrCtrl+Shift+L",
        click: () => handlers.onSetMode("label"),
      },
      {
        id: "mode-prepare",
        label: "Prepare Data",
        type: "radio",
        checked: mode === "prepare",
        enabled: configLoaded,
        accelerator: "CmdOrCtrl+Shift+P",
        click: () => handlers.onSetMode("prepare"),
      },
    ],
  };

  const editMenu: MenuItemConstructorOptions = { role: "editMenu" };

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: "togglefullscreen" },
    ...(isDev
      ? [
          { type: "separator" as const },
          { role: "reload" as const },
          { role: "toggleDevTools" as const },
        ]
      : []),
  ];
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: viewSubmenu,
  };

  const windowMenu: MenuItemConstructorOptions = { role: "windowMenu" };

  if (isMac) {
    const appMenu: MenuItemConstructorOptions = {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          id: "check-for-updates",
          label: "Check for Updates…",
          enabled: updatesArmed,
          click: () => handlers.onCheckForUpdates(),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    };
    return [appMenu, modeMenu, editMenu, viewMenu, windowMenu];
  }

  // Windows / Linux: no App menu. Mode accelerators are the sole entry point.
  return [modeMenu, editMenu, viewMenu, windowMenu];
}

// ---------------------------------------------------------------------------
// Stateful singleton that keeps the menu current as context changes.
// ---------------------------------------------------------------------------

let _handlers: MenuHandlers | null = null;
let _context: MenuContext | null = null;

function rebuild(): void {
  if (!_handlers || !_context) return;
  // Lazy import so tests that only call buildMenuTemplate never touch Electron.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Menu } = require("electron") as typeof import("electron");
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(_context, _handlers)));
}

/**
 * Install the application menu and wire the handlers.
 * Must be called after `app.whenReady()`.
 */
export function installAppMenu(
  platform: NodeJS.Platform,
  isDev: boolean,
  handlers: MenuHandlers,
): void {
  _handlers = handlers;
  _context = {
    isMac: platform === "darwin",
    isDev,
    configLoaded: false,
    mode: "label",
    updatesArmed: false,
  };
  rebuild();
}

/**
 * Call this whenever the renderer's menu context changes (config load / unload,
 * mode switch).  Also called by the updater when it arms.
 */
export function updateMenuContext(partial: Partial<Omit<MenuContext, "isMac" | "isDev">>): void {
  if (!_context) return;
  _context = { ..._context, ...partial };
  rebuild();
}
