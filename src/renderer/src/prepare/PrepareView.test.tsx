import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadConfig } from "@core/config";
import type { AppConfig, IpcApi, PrepareFileInfo } from "@core";
import { useStore } from "../store/store";
import { usePrepareStore } from "../store/prepare-store";
import { PrepareView } from "./PrepareView";

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

function fileInfo(path: string, rowCount = 4, ok = true): PrepareFileInfo {
  return { path, rowCount, ok, issues: [] };
}

function mockApi(overrides: Partial<IpcApi> = {}): IpcApi {
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => false,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
    installUpdate: async () => {},
    checkForUpdates: async () => {},
    openExternal: async () => {},
    revealPath: async () => {},
    getStartupConfig: async () => ({ status: "none" }),
    pickConfig: async () => ({ status: "canceled" }),
    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: () => "",
    saveSession: async () => {},
    clearSession: async () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),
    pickSplitFile: async () => ({ ok: false, canceled: true }),
    analyzeSplitFile: async () => ({ ok: false, canceled: true }),
    pickPrepareFiles: async () => ({ canceled: true, paths: [] }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  };
  const api: IpcApi = { ...base, ...overrides };
  Object.defineProperty(window, "api", { value: api, configurable: true });
  return api;
}

function dropFiles(names: string[]): void {
  const files = names.map((name) => new File([""], name));
  const target = screen
    .getByText(/Drop files here|Drop .* files to join|Drop source file/)
    .closest("section");
  if (!target) throw new Error("drop surface missing");
  fireEvent.drop(target, { dataTransfer: { files } });
}

describe("PrepareView action selector", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
    useStore.setState({ config: sampleConfig(), phase: "prepare" });
  });
  afterEach(() => cleanup());

  it("renders exactly 3 action buttons and no selected action by default", () => {
    render(<PrepareView />);
    expect(screen.getByRole("button", { name: /Split source/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /Join outputs/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /Join remaining/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByText(/Drop files to auto-detect/)).toBeInTheDocument();
  });

  it("clicking an action selects it and shows its panel", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    const joinOutputs = screen.getByRole("button", { name: /Join outputs/ });
    await user.click(joinOutputs);
    expect(joinOutputs).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Join output files")).toBeInTheDocument();
  });
});

describe("PrepareView", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
    useStore.setState({ config: sampleConfig(), phase: "prepare" });
  });
  afterEach(() => cleanup());

  it("shows the data contract and switches actions", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    expect(screen.getByText(/Data contract: Input schema 1 field/)).toBeInTheDocument();
    expect(screen.queryByText("Split an input file")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Split source/ }));
    expect(screen.getByText("Split an input file")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Join outputs/ }));
    expect(screen.getByText("Join output files")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Join remaining/ }));
    expect(screen.getByText("Join remaining files")).toBeInTheDocument();
  });

  it("walks the split happy path: pick → preview → run → results", async () => {
    const user = userEvent.setup();
    const revealPath = vi.fn(async () => {});
    mockApi({
      revealPath,
      pickSplitFile: async () => ({ ok: true, file: fileInfo("/d/input.csv", 5) }),
      runSplit: async () => ({
        ok: true,
        files: [
          { path: "/d/input-part1-of-2.csv", rowCount: 3 },
          { path: "/d/input-part2-of-2.csv", rowCount: 2 },
        ],
      }),
    });
    render(<PrepareView />);

    await user.click(screen.getByRole("button", { name: /Split source/ }));
    await user.click(screen.getByRole("button", { name: /choose source/i }));
    await waitFor(() => expect(screen.getByText("input.csv")).toBeInTheDocument());
    expect(screen.getByText("5 rows")).toBeInTheDocument();
    expect(screen.getByText("3, 2 rows per file")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /split into 2 files/i }));
    await waitFor(() => expect(screen.getByText("input-part1-of-2.csv")).toBeInTheDocument());
    expect(screen.getByText("input-part2-of-2.csv")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /show in/i })[0]!);
    expect(revealPath).toHaveBeenCalledWith("/d/input-part1-of-2.csv");
  });

  it("infers output joins from dropped output files", async () => {
    mockApi({
      pathForFile: (file) => `/d/${file.name}`,
      analyzeJoinFiles: async ({ paths }) => ({
        ok: true,
        files: paths.map((path) => fileInfo(path)),
        crossFileIssues: [],
        totalRows: paths.length,
      }),
    });
    render(<PrepareView />);

    dropFiles(["a-output.csv", "b-output.csv"]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Join outputs/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByText("a-output.csv")).toBeInTheDocument();
  });

  it("shows a resolver for ambiguous drops", async () => {
    const user = userEvent.setup();
    mockApi({
      pathForFile: (file) => `/d/${file.name}`,
      analyzeSplitFile: async (path) => ({ ok: true, file: fileInfo(path) }),
      analyzeJoinFiles: async ({ paths }) => ({
        ok: true,
        files: paths.map((path) => fileInfo(path)),
        crossFileIssues: [],
        totalRows: paths.length,
      }),
    });
    render(<PrepareView />);

    dropFiles(["a.csv", "b.csv"]);

    await waitFor(() =>
      expect(screen.getByText("Choose how to use these files")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByRole("button", { name: /Join outputs/ })[1]!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Join outputs/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("disables the join button when a file has errors", async () => {
    const user = userEvent.setup();
    const bad: PrepareFileInfo = {
      path: "/d/bad-output.csv",
      rowCount: 2,
      ok: false,
      issues: [{ kind: "missing", severity: "error", field: "label", message: "Missing column." }],
    };
    usePrepareStore.setState({
      selectedAction: "join-output",
      tab: "join-output",
      join: {
        output: { files: [bad], crossFileIssues: [], totalRows: 2, result: null },
        remaining: { files: [], crossFileIssues: [], totalRows: 0, result: null },
      },
    });
    render(<PrepareView />);

    expect(screen.getByText(/1 error/)).toBeInTheDocument();
    expect(screen.getByText(/Missing column/)).toBeInTheDocument();
    const joinButton = screen.getByRole("button", { name: /join 1 file/i });
    expect(joinButton).toBeDisabled();
    // Sanity: action selector still interactive.
    await user.click(screen.getByRole("button", { name: /Split source/ }));
    expect(screen.getByText("Split an input file")).toBeInTheDocument();
  });
});
