import { describe, expect, it, vi } from "vitest";
import { buildMenuTemplate } from "./menu";
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
    const modeMenu = template[1]!;
    const submenu = modeMenu.submenu as { type: string; id: string }[];
    expect(submenu).toHaveLength(2);
    expect(submenu[0]!.type).toBe("radio");
    expect(submenu[1]!.type).toBe("radio");
    expect(submenu[0]!.id).toBe("mode-label");
    expect(submenu[1]!.id).toBe("mode-prepare");
  });

  it("label radio is checked when mode=label", () => {
    const template = buildMenuTemplate(baseCtx({ mode: "label" }), makeHandlers());
    const submenu = template[1]!.submenu as { checked: boolean }[];
    expect(submenu[0]!.checked).toBe(true);
    expect(submenu[1]!.checked).toBe(false);
  });

  it("prepare radio is checked when mode=prepare", () => {
    const template = buildMenuTemplate(baseCtx({ mode: "prepare" }), makeHandlers());
    const submenu = template[1]!.submenu as { checked: boolean }[];
    expect(submenu[0]!.checked).toBe(false);
    expect(submenu[1]!.checked).toBe(true);
  });

  it("both radios are disabled when configLoaded=false", () => {
    const template = buildMenuTemplate(baseCtx({ configLoaded: false }), makeHandlers());
    const submenu = template[1]!.submenu as { enabled: boolean }[];
    expect(submenu[0]!.enabled).toBe(false);
    expect(submenu[1]!.enabled).toBe(false);
  });

  it("both radios are enabled when configLoaded=true", () => {
    const template = buildMenuTemplate(baseCtx({ configLoaded: true }), makeHandlers());
    const submenu = template[1]!.submenu as { enabled: boolean }[];
    expect(submenu[0]!.enabled).toBe(true);
    expect(submenu[1]!.enabled).toBe(true);
  });

  it("editMenu role is present (required for Cmd+C/V on macOS)", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: true }), makeHandlers());
    const editEntry = template.find((item) => item.role === "editMenu");
    expect(editEntry).toBeDefined();
  });

  it("check-for-updates item is disabled by default (updatesArmed=false)", () => {
    const template = buildMenuTemplate(baseCtx({ updatesArmed: false }), makeHandlers());
    const appSubmenu = template[0]!.submenu as { id?: string; enabled?: boolean }[];
    const checkItem = appSubmenu.find((item) => item.id === "check-for-updates");
    expect(checkItem).toBeDefined();
    expect(checkItem!.enabled).toBe(false);
  });

  it("check-for-updates item is enabled when updatesArmed=true", () => {
    const template = buildMenuTemplate(baseCtx({ updatesArmed: true }), makeHandlers());
    const appSubmenu = template[0]!.submenu as { id?: string; enabled?: boolean }[];
    const checkItem = appSubmenu.find((item) => item.id === "check-for-updates");
    expect(checkItem!.enabled).toBe(true);
  });

  it("reload and devTools items absent when isDev=false", () => {
    const template = buildMenuTemplate(baseCtx({ isDev: false }), makeHandlers());
    const viewSubmenu = template[3]!.submenu as { role?: string }[];
    expect(viewSubmenu.find((item) => item.role === "reload")).toBeUndefined();
    expect(viewSubmenu.find((item) => item.role === "toggleDevTools")).toBeUndefined();
  });

  it("reload and devTools items present when isDev=true", () => {
    const template = buildMenuTemplate(baseCtx({ isDev: true }), makeHandlers());
    const viewSubmenu = template[3]!.submenu as { role?: string }[];
    expect(viewSubmenu.find((item) => item.role === "reload")).toBeDefined();
    expect(viewSubmenu.find((item) => item.role === "toggleDevTools")).toBeDefined();
  });

  it("click on mode-label calls onSetMode('label')", () => {
    const handlers = makeHandlers();
    const template = buildMenuTemplate(baseCtx({ mode: "prepare" }), handlers);
    const submenu = template[1]!.submenu as { click?: () => void }[];
    submenu[0]!.click?.();
    expect(handlers.onSetMode).toHaveBeenCalledWith("label");
  });

  it("click on mode-prepare calls onSetMode('prepare')", () => {
    const handlers = makeHandlers();
    const template = buildMenuTemplate(baseCtx({ mode: "label" }), handlers);
    const submenu = template[1]!.submenu as { click?: () => void }[];
    submenu[1]!.click?.();
    expect(handlers.onSetMode).toHaveBeenCalledWith("prepare");
  });

  it("Mode items have accelerators", () => {
    const template = buildMenuTemplate(baseCtx(), makeHandlers());
    const submenu = template[1]!.submenu as { accelerator?: string }[];
    expect(submenu[0]!.accelerator).toBe("CmdOrCtrl+Shift+L");
    expect(submenu[1]!.accelerator).toBe("CmdOrCtrl+Shift+P");
  });
});

describe("buildMenuTemplate — Windows/Linux", () => {
  it("returns 4 top-level menus (no App menu) on Windows", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: false }), makeHandlers());
    expect(template).toHaveLength(4);
    expect(template[0]!.label).toBe("Mode");
    expect(template[1]!.role).toBe("editMenu");
    expect(template[2]!.label).toBe("View");
    expect(template[3]!.role).toBe("windowMenu");
  });

  it("has no appMenu role on Windows", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: false }), makeHandlers());
    expect(template.find((item) => item.role === "appMenu")).toBeUndefined();
  });

  it("Mode menu has accelerators on Windows too", () => {
    const template = buildMenuTemplate(baseCtx({ isMac: false }), makeHandlers());
    const submenu = template[0]!.submenu as { accelerator?: string }[];
    expect(submenu[0]!.accelerator).toBe("CmdOrCtrl+Shift+L");
    expect(submenu[1]!.accelerator).toBe("CmdOrCtrl+Shift+P");
  });
});
