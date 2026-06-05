import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadConfig } from "@core/config";
import type { AppConfig, IpcApi } from "@core";
import { App } from "./app";

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
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => true,
    onThemeChange: () => () => {},
    getStartupConfig: async () => ({ status: "none" }),
    pickConfig: async () => ({ status: "canceled" }),
    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: () => "",
    saveSession: async () => {},
    clearSession: async () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),
  };
  Object.defineProperty(window, "api", { value: { ...base, ...overrides }, configurable: true });
  Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
}

describe("App startup flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it("shows the config picker when no config is found", async () => {
    mockApi({ getStartupConfig: async () => ({ status: "none" }) });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Choose a configuration")).toBeInTheDocument());
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

  it("lets you go back to switch configs from the input screen", async () => {
    const user = userEvent.setup();
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig(),
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Open data to label")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /config/i }));
    expect(screen.getByText("Choose a configuration")).toBeInTheDocument();
  });
});
