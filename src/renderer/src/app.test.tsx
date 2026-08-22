import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IpcApi } from "@core";
import { buildConfig } from "@test/fixtures/config";
import { installIpcApi } from "@test/fixtures/ipc";
import { App } from "./app";
import { useAnnouncer } from "./a11y/announcer";
import { useStore } from "./store/store";

const sampleConfig = buildConfig();

const mockApi = (overrides: Partial<IpcApi> = {}): void => void installIpcApi(overrides);

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

  it("shows the input picker directly after a config loads (no mode-select screen)", async () => {
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig,
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Open data to label")).toBeInTheDocument());
    // Mode select screen must NOT appear.
    expect(screen.queryByText("Label data")).not.toBeInTheDocument();
    expect(screen.queryByText("Prepare data")).not.toBeInTheDocument();
  });

  it("navigates need-input → Config back button → need-config", async () => {
    const user = userEvent.setup();
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig,
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Open data to label")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /config/i }));
    expect(screen.getByText("Configure MLabel")).toBeInTheDocument();
  });

  it("onSetMode event switches from need-input to prepare phase", async () => {
    const listeners: Array<(mode: "label" | "prepare") => void> = [];
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig,
        path: "/x/c.jsonc",
      }),
      onSetMode: (cb) => {
        listeners.push(cb);
        return () => {};
      },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Open data to label")).toBeInTheDocument());

    // Simulate menu pushing "prepare" mode.
    listeners[0]?.("prepare");
    await waitFor(() => expect(screen.getByText("Drop files here")).toBeInTheDocument());
    expect(screen.getByText(/proposes the right operation/)).toBeInTheDocument();
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

  it("focuses the StartScreen h1 after a config loads (need-input)", async () => {
    mockApi({
      getStartupConfig: async () => ({
        status: "loaded",
        config: sampleConfig,
        path: "/x/c.jsonc",
      }),
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Open data to label")).toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1 });
    expect(document.activeElement).toBe(heading);
  });
});
