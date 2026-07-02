import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

function mockApi(overrides: Partial<IpcApi>): void {
  const api = { ...window.api, ...overrides } as IpcApi;
  Object.defineProperty(window, "api", { value: api, configurable: true });
}

describe("PrepareView tabs semantics", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
    useStore.setState({ config: sampleConfig(), phase: "prepare" });
  });
  afterEach(() => cleanup());

  it("renders exactly 3 tabs", () => {
    render(<PrepareView />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("aria-selected follows the store tab", () => {
    render(<PrepareView />);
    const splitTab = screen.getByRole("tab", { name: "Split input" });
    expect(splitTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Join outputs" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("arrow key moves selection and shows the next panel", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    const splitTab = screen.getByRole("tab", { name: "Split input" });
    splitTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Join outputs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Join output files")).toBeInTheDocument();
  });

  it("tabpanel is labelled by the active tab", () => {
    render(<PrepareView />);
    const panel = screen.getByRole("tabpanel");
    const splitTab = screen.getByRole("tab", { name: "Split input" });
    // The panel's aria-labelledby should reference the active trigger's id.
    expect(panel.getAttribute("aria-labelledby")).toBe(splitTab.id);
  });
});

describe("PrepareView", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
    useStore.setState({ config: sampleConfig(), phase: "prepare" });
  });
  afterEach(() => cleanup());

  it("shows the schema summary and switches tabs", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    expect(screen.getByText(/Input schema: id/)).toBeInTheDocument();
    expect(screen.getByText("Split an input file")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Join outputs" }));
    expect(screen.getByText("Join output files")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Join remaining" }));
    expect(screen.getByText("Join remaining files")).toBeInTheDocument();
  });

  it("walks the split happy path: pick → preview → run → results", async () => {
    const user = userEvent.setup();
    mockApi({
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

    await user.click(screen.getByRole("button", { name: /select input file/i }));
    await waitFor(() => expect(screen.getByText("input.csv")).toBeInTheDocument());
    expect(screen.getByText("5 rows")).toBeInTheDocument();
    expect(screen.getByText("3, 2 rows per file")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /split into 2 files/i }));
    await waitFor(() => expect(screen.getByText("input-part1-of-2.csv")).toBeInTheDocument());
    expect(screen.getByText("input-part2-of-2.csv")).toBeInTheDocument();
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
    // Sanity: tab strip still interactive.
    await user.click(screen.getByRole("tab", { name: "Split input" }));
    expect(screen.getByText("Split an input file")).toBeInTheDocument();
  });
});
