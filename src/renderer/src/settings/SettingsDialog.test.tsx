import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IpcApi, NetworkLogEntry, RecordView } from "@core";
import { makeIpcApi } from "@test/fixtures/ipc";
import { buildConfig } from "@test/fixtures/config";
import { ShortcutProvider } from "../shortcuts/ShortcutProvider";
import { useStore } from "../store/store";
import { SettingsDialog } from "./SettingsDialog";

const config = buildConfig({
  input: ["id"],
  output: [
    {
      name: "verdict",
      kind: "choice",
      displayName: "Verdict",
      choices: [
        { value: "good", label: "Looks good", shortcut: "g" },
        { value: "bad", label: "Bad" },
      ],
    },
    { name: "id", kind: "copied" },
  ],
});

const records: RecordView[] = [0, 1].map((i) => ({
  index: i,
  inputValues: { id: String(i) },
  labelValues: { id: String(i), verdict: null },
  coercionErrors: [],
}));

function install(overrides: Partial<IpcApi> = {}): void {
  Object.defineProperty(window, "api", { value: makeIpcApi(overrides), configurable: true });
  Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
}

const show = () =>
  render(
    <ShortcutProvider>
      <SettingsDialog open onOpenChange={() => {}} />
    </ShortcutProvider>,
  );

const tab = (name: string) => screen.getByRole("tab", { name });

beforeEach(() => {
  install();
  useStore.setState({
    phase: "labeling",
    config,
    configPath: "/work/review.jsonc",
    inputPath: "/work/batch.csv",
    records,
    labels: { 0: { verdict: "good" }, 1: {} },
    prefill: {},
    index: 0,
    shortcutOverrides: {},
    settings: {
      version: 1,
      themeMode: "system",
      colorTheme: "cobalt",
      shortcuts: {},
      updateChecks: true,
      aiEnabled: false,
      aiModelId: "qwen3.5-2b",
    },
    updateStatus: null,
  });
});
afterEach(() => cleanup());

describe("SettingsDialog", () => {
  it("offers every section", async () => {
    show();
    for (const name of ["Keys", "Version", "Config", "Session", "Network"]) {
      expect(tab(name)).toBeInTheDocument();
    }
  });

  it("shows the running version", async () => {
    install({
      getAppInfo: async () => ({
        version: "9.9.9",
        platform: "darwin",
        arch: "arm64",
        packaged: true,
        updatesArmed: true,
        updatesAllowedByConfig: true,
        aiAllowedByConfig: true,
        modelDownloadAllowedByConfig: true,
        aiPlatformSupported: true,
      }),
    });
    show();
    await waitFor(() => expect(screen.getAllByText(/9\.9\.9/).length).toBeGreaterThan(0));
  });
});

describe("SettingsDialog: keys", () => {
  it("lists the built-in actions alongside the config's own", async () => {
    show();
    expect(screen.getByText("Next unfinished record")).toBeInTheDocument();
    expect(screen.getByText("Choose “Looks good”")).toBeInTheDocument();
  });

  it("marks an action the native menu owns as not remappable", () => {
    show();
    expect(screen.getAllByText("Menu").length).toBeGreaterThan(0);
  });

  it("records a new chord and persists it", async () => {
    const setSettings = vi.fn(async (patch) => ({
      version: 1,
      themeMode: "system" as const,
      colorTheme: "cobalt" as const,
      shortcuts: {},
      updateChecks: true,
      aiEnabled: false,
      aiModelId: "qwen3.5-2b",
      ...patch,
    }));
    install({ setSettings });
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("button", { name: /Change the shortcut for Next record/ }));
    expect(screen.getByText("Listening…")).toBeInTheDocument();
    await user.keyboard("n");

    await waitFor(() => expect(setSettings).toHaveBeenCalled());
    const patch = setSettings.mock.calls.at(-1)?.[0] as { shortcuts: Record<string, string[]> };
    expect(patch.shortcuts["nav.next"]).toEqual(["n"]);
  });

  // A pane that permitted what the config validator forbids would be a second
  // source of truth for the same rule.
  it("refuses a chord the system owns", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: /Change the shortcut for Next record/ }));
    await user.keyboard("{Meta>}v{/Meta}");
    expect(await screen.findByText(/belongs to the system/)).toBeInTheDocument();
  });

  it("refuses a chord another action already claims", async () => {
    const user = userEvent.setup();
    show();
    await user.click(
      screen.getByRole("button", { name: /Change the shortcut for Previous record/ }),
    );
    // `g` already picks "good" in this config.
    await user.keyboard("g");
    expect(await screen.findByText(/already does/)).toBeInTheDocument();
  });

  it("cancels the recording on Escape without closing the pane", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ShortcutProvider>
        <SettingsDialog open onOpenChange={onOpenChange} />
      </ShortcutProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Change the shortcut for Next record/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Listening…")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("offers a reset once something has been changed", () => {
    useStore.setState({ shortcutOverrides: { "nav.next": ["n"] } });
    show();
    expect(screen.getByRole("button", { name: /Reset all \(1\)/ })).toBeInTheDocument();
  });

  it("filters the list", async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByLabelText("Filter shortcuts"), "unfinished");
    expect(screen.getByText("Next unfinished record")).toBeInTheDocument();
    expect(screen.queryByText("Save & export")).not.toBeInTheDocument();
  });
});

describe("SettingsDialog: config summary", () => {
  it("reads the loaded config back in plain language", async () => {
    const user = userEvent.setup();
    show();
    await user.click(tab("Config"));
    expect(screen.getByText("review.jsonc")).toBeInTheDocument();
    expect(screen.getByText(/output fields/)).toBeInTheDocument();
    expect(screen.getByText(/1 you answer/)).toBeInTheDocument();
  });
});

describe("SettingsDialog: session", () => {
  it("reports progress and where it is stored", async () => {
    const user = userEvent.setup();
    show();
    await user.click(tab("Session"));
    expect(screen.getByText(/1 of 2 labeled/)).toBeInTheDocument();
    expect(screen.getByText("batch.csv")).toBeInTheDocument();
  });

  it("asks before throwing the labels away", async () => {
    const clearSession = vi.fn(async () => {});
    install({ clearSession });
    const user = userEvent.setup();
    show();
    await user.click(tab("Session"));
    await user.click(screen.getByRole("button", { name: "Clear session" }));

    expect(screen.getByText("Clear this session?")).toBeInTheDocument();
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("clears the labels and the saved file together once confirmed", async () => {
    const clearSession = vi.fn(async () => {});
    install({ clearSession });
    const user = userEvent.setup();
    show();
    await user.click(tab("Session"));
    await user.click(screen.getByRole("button", { name: "Clear session" }));
    const dialog = screen.getByText("Clear this session?").closest("[role=dialog]")!;
    await user.click(within(dialog as HTMLElement).getByRole("button", { name: "Clear session" }));

    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    // Reseeded from the record, not emptied: the copied `id` was never the
    // labeler's answer and must survive.
    expect(useStore.getState().labels[0]).toEqual({ id: "0", verdict: null });
  });
});

const entry = (over: Partial<NetworkLogEntry> = {}): NetworkLogEntry => ({
  id: 1,
  at: Date.now(),
  kind: "update-check",
  label: "Check for updates",
  host: "github.com",
  outcome: "success",
  ...over,
});

describe("SettingsDialog: network", () => {
  // The log is the claim. A banner asserting that nothing left the machine said
  // the same thing the empty list below it already said, and the one a reader
  // has reason to trust is the list.
  it("reads an empty log as reassurance rather than as a gap", async () => {
    const user = userEvent.setup();
    show();
    await user.click(tab("Network"));
    expect(screen.getByText(/That is the whole feature/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing has left this machine/)).toBeNull();
  });

  it("lists the calls that were made", async () => {
    install({ getNetworkLog: async () => [entry()] });
    const user = userEvent.setup();
    show();
    await user.click(tab("Network"));
    await waitFor(() => expect(screen.getByText("github.com")).toBeInTheDocument());
  });

  it("calls out a blocked request", async () => {
    install({
      getNetworkLog: async () => [entry({ kind: "denied", outcome: "denied", label: "Blocked" })],
    });
    const user = userEvent.setup();
    show();
    await user.click(tab("Network"));
    // A denial is the one thing a reader cannot infer at a glance from a list of
    // rows, so it keeps a count of its own next to the heading.
    await waitFor(() => expect(screen.getByText("1 blocked")).toBeInTheDocument());
  });

  it("lets the labeler turn update checks off", async () => {
    const setSettings = vi.fn(async () => ({
      version: 1,
      themeMode: "system" as const,
      colorTheme: "cobalt" as const,
      shortcuts: {},
      updateChecks: false,
      aiEnabled: false,
      aiModelId: "qwen3.5-2b",
    }));
    install({ setSettings });
    const user = userEvent.setup();
    show();
    await user.click(tab("Network"));
    await user.click(screen.getByRole("switch", { name: "Check GitHub for updates" }));
    expect(setSettings).toHaveBeenCalledWith({ updateChecks: false });
  });

  // A capability the config switched off is absent, not greyed out: a disabled
  // control still advertises a feature and sends someone hunting for the switch.
  it("drops the section entirely when the config forbids network", async () => {
    install({
      getAppInfo: async () => ({
        version: "0.0.0",
        platform: "darwin",
        arch: "arm64",
        packaged: true,
        updatesArmed: false,
        updatesAllowedByConfig: false,
        aiAllowedByConfig: true,
        modelDownloadAllowedByConfig: true,
        aiPlatformSupported: true,
      }),
    });
    show();
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Network" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("tab", { name: "Keys" })).toBeInTheDocument();
  });
});

describe("SettingsDialog: anomaly detection", () => {
  const info = (over: Record<string, unknown> = {}) => ({
    version: "0.0.0",
    platform: "darwin",
    arch: "arm64",
    packaged: true,
    updatesArmed: true,
    updatesAllowedByConfig: true,
    aiAllowedByConfig: true,
    modelDownloadAllowedByConfig: true,
    aiPlatformSupported: true,
    ...over,
  });

  afterEach(() => useStore.setState({ downloadedModels: [] }));

  it("offers the section when the config permits it", async () => {
    install({ getAppInfo: async () => info() });
    show();
    await waitFor(() => expect(tab("Anomalies")).toBeInTheDocument());
  });

  // A capability the config switched off is absent, not greyed out.
  it("drops the section when the config forbids AI", async () => {
    install({ getAppInfo: async () => info({ aiAllowedByConfig: false }) });
    show();
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Anomalies" })).not.toBeInTheDocument(),
    );
  });

  it("drops the section when downloads are forbidden and no model is here", async () => {
    install({ getAppInfo: async () => info({ modelDownloadAllowedByConfig: false }) });
    show();
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Anomalies" })).not.toBeInTheDocument(),
    );
  });

  // The carve-out: a model lives per machine, a config is per project. A project
  // that forbids fetching must not disable weights already sitting on disk.
  it("keeps the section when downloads are forbidden but a model is already here", async () => {
    useStore.setState({ downloadedModels: ["qwen3.5-2b"] });
    install({ getAppInfo: async () => info({ modelDownloadAllowedByConfig: false }) });
    show();
    await waitFor(() => expect(tab("Anomalies")).toBeInTheDocument());
  });

  it("drops the section on a build with no inference binary", async () => {
    install({ getAppInfo: async () => info({ aiPlatformSupported: false }) });
    show();
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Anomalies" })).not.toBeInTheDocument(),
    );
  });

  it("downloads nothing until the labeler turns it on", async () => {
    install({ getAppInfo: async () => info() });
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(tab("Anomalies")).toBeInTheDocument());
    await user.click(tab("Anomalies"));
    // With the switch off there is no model list, so nothing to download.
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
    expect(screen.getByRole("switch", { name: "Look for anomalies" })).toBeInTheDocument();
  });

  it("says plainly that the results need verifying", async () => {
    install({ getAppInfo: async () => info() });
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(tab("Anomalies")).toBeInTheDocument());
    await user.click(tab("Anomalies"));
    await user.click(screen.getByRole("switch", { name: "Look for anomalies" }));

    expect(await screen.findByText(/All results should be reviewed/)).toBeInTheDocument();
  });

  // Telling someone to verify the results is only actionable if they can see
  // what was asked, so the log sits in the same section as the instruction.
  it("lists what the model was asked, beside the warning to verify it", async () => {
    install({
      getAppInfo: async () => info(),
      getModelLog: async () => [
        {
          id: 1,
          at: Date.parse("2026-05-01T12:00:00Z"),
          recordIndex: 3,
          modelId: "qwen3.5-2b",
          status: "findings" as const,
          elapsedMs: 1200,
          prefix: "Instructions here.",
          suffix: "The row to review:\nemail: a@b.com",
          raw: '{"reasoning":"x","findings":[]}',
          findings: [{ field: "email", severity: "warning" as const, reason: "Throwaway." }],
        },
      ],
    });
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(tab("Anomalies")).toBeInTheDocument());
    await user.click(tab("Anomalies"));
    await user.click(screen.getByRole("switch", { name: "Look for anomalies" }));

    const row = await screen.findByRole("button", { name: /Record 4/ });
    await user.click(row);
    expect(screen.getByText(/email: a@b.com/)).toBeInTheDocument();
  });

  it("offers the models once it is on", async () => {
    install({ getAppInfo: async () => info() });
    const user = userEvent.setup();
    show();
    await waitFor(() => expect(tab("Anomalies")).toBeInTheDocument());
    await user.click(tab("Anomalies"));
    await user.click(screen.getByRole("switch", { name: "Look for anomalies" }));

    expect(await screen.findByText("Qwen3.5 2B")).toBeInTheDocument();
    expect(screen.getByText("Qwen3 1.7B")).toBeInTheDocument();
  });
});
