import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { IpcApi, JoinAnalyzeResponse, PrepareFileInfo } from "@core";
import { buildConfig } from "@test/fixtures/config";
import { installIpcApi } from "@test/fixtures/ipc";
import { useStore } from "../store/store";
import { usePrepareStore } from "../store/prepare-store";
import { PrepareView } from "./PrepareView";

const sampleConfig = buildConfig();

function fileInfo(path: string, rowCount = 4, ok = true): PrepareFileInfo {
  return { path, rowCount, ok, issues: [] };
}

function joinOk(paths: readonly string[]): JoinAnalyzeResponse {
  return {
    ok: true,
    files: paths.map((path) => fileInfo(path)),
    crossFileIssues: [],
    totalRows: paths.length,
  };
}

/** Prepare needs live split/join analysis, so those three are stubbed for real. */
function mockApi(overrides: Partial<IpcApi> = {}): IpcApi {
  return installIpcApi({
    pathForFile: (file) => `/d/${file.name}`,
    analyzeSplitFile: async (path) => ({ ok: true, file: fileInfo(path, 5) }),
    analyzeJoinFiles: async ({ paths }) => joinOk(paths),
    ...overrides,
  });
}

function dropFiles(names: string[]): void {
  const files = names.map((name) => new File([""], name));
  const card = screen.getByRole("region", { name: "Prepare workspace" });
  fireEvent.drop(card, { dataTransfer: { files } });
}

describe("PrepareView", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
    useStore.setState({ config: sampleConfig, phase: "prepare" });
    mockApi();
  });
  afterEach(() => cleanup());

  it("starts idle: drop copy, browse affordance, contract footer, no tiles", () => {
    render(<PrepareView />);
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
    expect(screen.getByText(/proposes the right operation/)).toBeInTheDocument();
    expect(screen.getByText("Browse files…")).toBeInTheDocument();
    expect(screen.getByText(/Data contract · 1 input field → 1 output field/)).toBeInTheDocument();
    // Delta a: use radio instead of radiogroup
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prepare data" })).toHaveFocus();
  });

  it("browse feeds the proposal flow", async () => {
    const user = userEvent.setup();
    mockApi({ pickPrepareFiles: async () => ({ canceled: false, paths: ["/d/plain.csv"] }) });
    render(<PrepareView />);
    await user.click(screen.getByText("Browse files…"));
    await waitFor(() =>
      expect(screen.getByText(/1 file ready — confirm the operation/)).toBeInTheDocument(),
    );
  });

  it("drop shows the confirm stage with the hinted op recommended and preselected", async () => {
    render(<PrepareView />);
    dropFiles(["a-output.csv", "b-output.csv"]);

    // Delta b: use getAllByRole("radio") with length check
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    // Delta b: use toBeChecked() instead of aria-checked attribute
    expect(screen.getByRole("radio", { name: /Join outputs/ })).toBeChecked();
    expect(screen.getByText("a-output.csv, b-output.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Join outputs/ })).toBeEnabled();
  });

  it("ambiguous drops preselect nothing and disable Continue until a pick", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    dropFiles(["a.csv", "b.csv"]);

    // Delta c: use getAllByRole("radio") with length check
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    expect(continueButton).toBeDisabled();

    // Delta c: click the label card text instead of radio role
    await user.click(screen.getByText("Join remaining"));
    expect(screen.getByRole("button", { name: /Continue with Join remaining/ })).toBeEnabled();
  });

  it("walks split end-to-end: drop → confirm → chunk map with real names → run → results", async () => {
    const user = userEvent.setup();
    const revealPath = vi.fn(async () => {});
    mockApi({
      revealPath,
      runSplit: async () => ({
        ok: true,
        files: [
          { path: "/d/input-part1-of-2.csv", rowCount: 3 },
          { path: "/d/input-part2-of-2.csv", rowCount: 2 },
        ],
      }),
    });
    render(<PrepareView />);
    dropFiles(["input.csv"]);

    // Delta d: use toBeChecked() instead of aria-checked attribute
    await waitFor(() => expect(screen.getByRole("radio", { name: /Split source/ })).toBeChecked());
    await user.click(screen.getByRole("button", { name: /Continue with Split source/ }));

    await waitFor(() => expect(screen.getByText("input.csv")).toBeInTheDocument());
    expect(screen.getByText("input-part1-of-2.csv")).toBeInTheDocument();
    expect(screen.getByText("input-part2-of-2.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /split into 2 files/i }));
    await waitFor(() => expect(screen.getByText("Split complete")).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: /show in/i })[0]!);
    expect(revealPath).toHaveBeenCalledWith("/d/input-part1-of-2.csv");
  });

  it("change operation returns to the confirm stage", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    dropFiles(["input.csv"]);
    await screen.findByRole("button", { name: /Continue with Split source/ });
    await user.click(screen.getByRole("button", { name: /Continue with Split source/ }));
    await screen.findByRole("button", { name: /change operation/i });

    await user.click(screen.getByRole("button", { name: /change operation/i }));
    // Delta e: use getAllByRole("radio") with length check
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
  });

  it("start over returns to idle", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    dropFiles(["input.csv"]);
    await screen.findByRole("button", { name: "Start over" });
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop files here/ })).toHaveFocus();
  });

  it("blocks joins containing files with errors", async () => {
    const user = userEvent.setup();
    const bad: PrepareFileInfo = {
      path: "/d/bad-output.csv",
      rowCount: 2,
      ok: false,
      issues: [{ kind: "missing", severity: "error", field: "label", message: "Missing column." }],
    };
    mockApi({
      analyzeJoinFiles: async ({ kind, paths }) =>
        kind === "output"
          ? { ok: false, files: [bad], crossFileIssues: [], totalRows: 2 }
          : joinOk(paths),
    });
    render(<PrepareView />);
    dropFiles(["bad-output.csv"]);

    // Delta f: use getAllByRole("radio") instead of getByRole("radiogroup")
    await waitFor(() => expect(screen.getAllByRole("radio")).toHaveLength(3));
    // Hinted recommendation still preselects join-output despite errors.
    await user.click(screen.getByRole("button", { name: /Continue with Join outputs/ }));

    await waitFor(() => expect(screen.getByText(/Missing column/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /join 1 file/i })).toBeDisabled();
  });
});
