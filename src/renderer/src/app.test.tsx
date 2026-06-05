import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import type { IpcApi } from "@core";
import { App } from "./app";

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
});
