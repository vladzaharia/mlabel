import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadConfig } from "@core/config";
import type { AppConfig, IpcApi } from "@core";
import { App } from "./app";
import { useAnnouncer } from "./a11y/announcer";
import { useStore } from "./store/store";

function sampleConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": { "fields": [{ "name": "label", "control": "text" }] }
  }`);
  if (!result.ok) throw new Error("invalid sample config");
  return result.config;
}

function mockApi(overrides: Partial<IpcApi> = {}): void {
  const base = {
    ping: async () => "pong" as const,
    getTheme: async () => true,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    installUpdate: async () => {},
    checkForUpdates: async () => {},
    openExternal: async () => {},
    revealPath: async () => {},
    getStartupConfig: async () => ({ status: "none" as const }),
    pickConfig: async () => ({ status: "canceled" as const }),
    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: () => "",
    saveSession: async () => {},
    clearSession: async () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),
    pickSplitFile: async () => ({ ok: false, canceled: true }),
    analyzeSplitFile: async () => ({ ok: false, canceled: true }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  } satisfies IpcApi;
  Object.defineProperty(window, "api", { value: { ...base, ...overrides }, configurable: true });
  Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
}

describe("App startup flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset both the app store phase and the announcer between tests so
    // singleton Zustand state from prior renders doesn't bleed through.
    useStore.setState({ phase: "boot" });
    useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });
  });
  afterEach(() => cleanup());

  it("shows the config picker when no config is found", async () => {
    mockApi({ getStartupConfig: async () => ({ status: "none" }) });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Configure MLabel")).toBeInTheDocument());
  });

  it("shows config issues when the startup config is invalid", async () => {
    mockApi({
      getStartupConfig: async () => ({
        status: "invalid",
        path: "/x/config.jsonc",
        issues: [{ message: "broken", path: "input" }],
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("This config isn’t valid")).toBeInTheDocument());
  });

  it("offers Label and Prepare after a config loads", async () => {
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig(),
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Label data")).toBeInTheDocument());
    expect(screen.getByText("Prepare data")).toBeInTheDocument();
    expect(screen.getByText(/1 input column · 1 output field/)).toBeInTheDocument();
  });

  it("navigates mode select → labeling input → back → prepare → back → config", async () => {
    const user = userEvent.setup();
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig(),
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Label data")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /label data/i }));
    expect(screen.getByText("Open data to label")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /prepare data/i }));
    expect(screen.getByText("Split an input file")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back/i }));
    await user.click(screen.getByRole("button", { name: /config/i }));
    expect(screen.getByText("Configure MLabel")).toBeInTheDocument();
  });

  it("announces the phase in the live region after startup resolves", async () => {
    mockApi({ getStartupConfig: async () => ({ status: "none" }) });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Configure MLabel")).toBeInTheDocument());
    // The polite live region (<output>) should carry the phase announcement.
    expect(screen.getByRole("status")).toHaveTextContent("Choose a config file");
  });

  it("announces assertively when the startup config is invalid", async () => {
    mockApi({
      getStartupConfig: async () => ({
        status: "invalid",
        path: "/x/config.jsonc",
        issues: [{ message: "broken", path: "input" }],
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Config invalid");
  });

  it("focuses the screen h1 after startup resolves", async () => {
    mockApi({ getStartupConfig: async () => ({ status: "none" }) });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Configure MLabel")).toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1, name: "Configure MLabel" });
    expect(document.activeElement).toBe(heading);
  });

  it("focuses the mode select h1 after a config loads", async () => {
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig(),
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Label data")).toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1 });
    // The ModeSelectScreen h1 is the config title (defaults to "MLabel").
    expect(document.activeElement).toBe(heading);
  });
});
