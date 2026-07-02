import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock electron so menu.ts's top-level `import { Menu } from "electron"` resolves
// in the node test environment (no Electron runtime available).
// Pattern matches src/main/services/session-store.test.ts.
const { buildFromTemplateMock, setApplicationMenuMock } = vi.hoisted(() => ({
  buildFromTemplateMock: vi.fn((t: unknown) => t),
  setApplicationMenuMock: vi.fn(),
}));
vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: buildFromTemplateMock,
    setApplicationMenu: setApplicationMenuMock,
  },
}));

import { buildMenuTemplate, installAppMenu, updateMenuContext } from "./menu";
import type { MenuContext, MenuHandlers } from "./menu";

function makeHandlers(): MenuHandlers {
  return {
    onSetMode: vi.fn(),
    onCheckForUpdates: vi.fn(),
  };
}

function baseCtx(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    isMac: true,
    isDev: false,
    configLoaded: true,
    mode: "label",
    updatesArmed: false,
    ...overrides,
  };
}

/** Finds the "Mode" top-level menu item from a template. */
function findModeMenu(template: ReturnType<typeof buildMenuTemplate>): (typeof template)[0] {
  const menu = template.find((item) => item.label === "Mode");
  if (!menu) throw new Error("Mode menu not found in template");
  return menu;
}

/** Finds the "View" top-level menu item from a template. */
function findViewMenu(template: ReturnType<typeof buildMenuTemplate>): (typeof template)[0] {
  const menu = template.find((item) => item.label === "View");
  if (!menu) throw new Error("View menu not found in template");
  return menu;
}

describe("buildMenuTemplate — macOS", () => {
  it("returns 5 top-level menus on macOS", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: true }), makeHandlers());
    expect(template).toHaveLength(5);
    // App, Mode, Edit, View, Window
    expect(template[0]!.role).toBe("appMenu");
    expect(template[1]!.label).toBe("Mode");
    expect(template[2]!.role).toBe("editMenu");
    expect(template[3]!.label).toBe("View");
    expect(template[4]!.role).toBe("windowMenu");
  });

  it("Mode submenu has two radio items", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: true }), makeHandlers());
    const submenu = findModeMenu(template).submenu as { type: string; id: string }[];
    expect(submenu).toHaveLength(2);
    expect(submenu[0]!.type).toBe("radio");
    expect(submenu[1]!.type).toBe("radio");
    expect(submenu[0]!.id).toBe("mode-label");
    expect(submenu[1]!.id).toBe("mode-prepare");
  });

  it("label radio is checked when mode=label", () => {
    const template = buildMenuTemplate(baseCtx({ mode: "label" }), makeHandlers());
    const submenu = findModeMenu(template).submenu as { id: string; checked: boolean }[];
    expect(submenu.find((i) => i.id === "mode-label")!.checked).toBe(true);
    expect(submenu.find((i) => i.id === "mode-prepare")!.checked).toBe(false);
  });

  it("prepare radio is checked when mode=prepare", () => {
    const template = buildMenuTemplate(baseCtx({ mode: "prepare" }), makeHandlers());
    const submenu = findModeMenu(template).submenu as { id: string; checked: boolean }[];
    expect(submenu.find((i) => i.id === "mode-label")!.checked).toBe(false);
    expect(submenu.find((i) => i.id === "mode-prepare")!.checked).toBe(true);
  });

  it("both radios are disabled when configLoaded=false", () => {
    const template = buildMenuTemplate(baseCtx({ configLoaded: false }), makeHandlers());
    const submenu = findModeMenu(template).submenu as { id: string; enabled: boolean }[];
    expect(submenu.find((i) => i.id === "mode-label")!.enabled).toBe(false);
    expect(submenu.find((i) => i.id === "mode-prepare")!.enabled).toBe(false);
  });

  it("both radios are enabled when configLoaded=true", () => {
    const template = buildMenuTemplate(baseCtx({ configLoaded: true }), makeHandlers());
    const submenu = findModeMenu(template).submenu as { id: string; enabled: boolean }[];
    expect(submenu.find((i) => i.id === "mode-label")!.enabled).toBe(true);
    expect(submenu.find((i) => i.id === "mode-prepare")!.enabled).toBe(true);
  });

  it("editMenu role is present (required for Cmd+C/V on macOS)", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: true }), makeHandlers());
    const editEntry = template.find((item) => item.role === "editMenu");
    expect(editEntry).toBeDefined();
  });

  it("check-for-updates item is disabled by default (updatesArmed=false)", () => {
    const template = buildMenuTemplate(baseCtx({ updatesArmed: false }), makeHandlers());
    const appSubmenu = template.find((item) => item.role === "appMenu")!.submenu as {
      id?: string;
      enabled?: boolean;
    }[];
    const checkItem = appSubmenu.find((item) => item.id === "check-for-updates");
    expect(checkItem).toBeDefined();
    expect(checkItem!.enabled).toBe(false);
  });

  it("check-for-updates item is enabled when updatesArmed=true", () => {
    const template = buildMenuTemplate(baseCtx({ updatesArmed: true }), makeHandlers());
    const appSubmenu = template.find((item) => item.role === "appMenu")!.submenu as {
      id?: string;
      enabled?: boolean;
    }[];
    const checkItem = appSubmenu.find((item) => item.id === "check-for-updates");
    expect(checkItem!.enabled).toBe(true);
  });

  it("reload and devTools items absent when isDev=false", () => {
    const template = buildMenuTemplate(baseCtx({ isDev: false }), makeHandlers());
    const viewSubmenu = findViewMenu(template).submenu as { role?: string }[];
    expect(viewSubmenu.find((item) => item.role === "reload")).toBeUndefined();
    expect(viewSubmenu.find((item) => item.role === "toggleDevTools")).toBeUndefined();
  });

  it("reload and devTools items present when isDev=true", () => {
    const template = buildMenuTemplate(baseCtx({ isDev: true }), makeHandlers());
    const viewSubmenu = findViewMenu(template).submenu as { role?: string }[];
    expect(viewSubmenu.find((item) => item.role === "reload")).toBeDefined();
    expect(viewSubmenu.find((item) => item.role === "toggleDevTools")).toBeDefined();
  });

  it("click on mode-label calls onSetMode('label')", () => {
    const handlers = makeHandlers();
    const template = buildMenuTemplate(baseCtx({ mode: "prepare" }), handlers);
    const submenu = findModeMenu(template).submenu as { id: string; click?: () => void }[];
    submenu.find((i) => i.id === "mode-label")!.click?.();
    expect(handlers.onSetMode).toHaveBeenCalledWith("label");
  });

  it("click on mode-prepare calls onSetMode('prepare')", () => {
    const handlers = makeHandlers();
    const template = buildMenuTemplate(baseCtx({ mode: "label" }), handlers);
    const submenu = findModeMenu(template).submenu as { id: string; click?: () => void }[];
    submenu.find((i) => i.id === "mode-prepare")!.click?.();
    expect(handlers.onSetMode).toHaveBeenCalledWith("prepare");
  });

  it("Mode items have accelerators", () => {
    const template = buildMenuTemplate(baseCtx(), makeHandlers());
    const submenu = findModeMenu(template).submenu as { id: string; accelerator?: string }[];
    expect(submenu.find((i) => i.id === "mode-label")!.accelerator).toBe("CmdOrCtrl+Shift+L");
    expect(submenu.find((i) => i.id === "mode-prepare")!.accelerator).toBe("CmdOrCtrl+Shift+P");
  });
});

describe("buildMenuTemplate — Windows/Linux", () => {
  it("returns 4 top-level menus (no App menu) on Windows", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: false }), makeHandlers());
    expect(template).toHaveLength(4);
    expect(template.find((item) => item.label === "Mode")).toBeDefined();
    expect(template.find((item) => item.role === "editMenu")).toBeDefined();
    expect(template.find((item) => item.label === "View")).toBeDefined();
    expect(template.find((item) => item.role === "windowMenu")).toBeDefined();
  });

  it("has no appMenu role on Windows", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: false }), makeHandlers());
    expect(template.find((item) => item.role === "appMenu")).toBeUndefined();
  });

  it("Mode menu has accelerators on Windows too", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: false }), makeHandlers());
    const submenu = findModeMenu(template).submenu as { id: string; accelerator?: string }[];
    expect(submenu.find((i) => i.id === "mode-label")!.accelerator).toBe("CmdOrCtrl+Shift+L");
    expect(submenu.find((i) => i.id === "mode-prepare")!.accelerator).toBe("CmdOrCtrl+Shift+P");
  });
});

// ---------------------------------------------------------------------------
// updateMenuContext — stateful singleton wires through to Menu.setApplicationMenu
// ---------------------------------------------------------------------------
describe("updateMenuContext", () => {
  beforeEach(() => {
    setApplicationMenuMock.mockClear();
    buildFromTemplateMock.mockClear();
  });

  it("calls Menu.setApplicationMenu after installAppMenu", () => {
    installAppMenu("darwin", false, makeHandlers());
    expect(setApplicationMenuMock).toHaveBeenCalledOnce();
  });

  it("updateMenuContext triggers Menu.setApplicationMenu with updated context", () => {
    installAppMenu("darwin", false, makeHandlers());
    setApplicationMenuMock.mockClear();

    updateMenuContext({ configLoaded: true, mode: "prepare" });

    expect(setApplicationMenuMock).toHaveBeenCalledOnce();
    // The rebuilt template should reflect mode=prepare: mode-prepare radio is checked.
    const builtTemplate = buildFromTemplateMock.mock.calls.at(-1)?.[0] as
      | ReturnType<typeof buildMenuTemplate>
      | undefined;
    const modeSubmenu = builtTemplate
      ? (findModeMenu(builtTemplate).submenu as { id: string; checked: boolean }[])
      : [];
    expect(modeSubmenu.find((i) => i.id === "mode-prepare")!.checked).toBe(true);
    expect(modeSubmenu.find((i) => i.id === "mode-label")!.checked).toBe(false);
  });
});
