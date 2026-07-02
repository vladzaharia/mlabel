import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { IpcApi, RecordView, SessionData } from "@core";
import { useStore } from "../store/store";
import { ResumeDialog } from "./ResumeDialog";

function mockApi(overrides: Partial<IpcApi> = {}): IpcApi {
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => true,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    installUpdate: async () => {},
    openExternal: async () => {},
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
    analyzeSplitFile: async () => ({ ok: false }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  };
  const api = { ...base, ...overrides };
  Object.defineProperty(window, "api", { value: api, configurable: true });
  return api;
}

const records: RecordView[] = [
  { index: 0, inputValues: { id: "1" }, labelValues: { id: "1" }, coercionErrors: [] },
  { index: 1, inputValues: { id: "2" }, labelValues: { id: "2" }, coercionErrors: [] },
];

const session: SessionData = {
  configPath: "/cfg.jsonc",
  inputPath: "/in.csv",
  index: 1,
  labels: { 0: { verdict: "good" }, 1: { verdict: "bad" } },
};

describe("ResumeDialog", () => {
  beforeEach(() => {
    mockApi();
    useStore.setState({ pendingResume: null, records, index: 0, labels: {} });
  });
  afterEach(() => cleanup());

  it("renders nothing when there is no pending resume", () => {
    const { container } = render(<ResumeDialog />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Resume previous session?")).not.toBeInTheDocument();
  });

  it("shows the touched-record count when a session is pending", () => {
    useStore.setState({ pendingResume: session });
    render(<ResumeDialog />);
    expect(screen.getByText("Resume previous session?")).toBeInTheDocument();
    expect(screen.getByText(/\(2 records touched\)/)).toBeInTheDocument();
  });

  it("uses singular wording for a single touched record", () => {
    useStore.setState({ pendingResume: { ...session, labels: { 0: { verdict: "good" } } } });
    render(<ResumeDialog />);
    expect(screen.getByText(/\(1 record touched\)/)).toBeInTheDocument();
  });

  it("shows destructive copy warning about deleted progress", () => {
    useStore.setState({ pendingResume: session });
    render(<ResumeDialog />);
    expect(
      screen.getByText(/Starting fresh permanently deletes this saved progress/),
    ).toBeInTheDocument();
  });

  it('"Resume" applies the saved labels and index and clears the prompt', () => {
    useStore.setState({ pendingResume: session });
    render(<ResumeDialog />);
    // fireEvent: Radix modal dialogs disable body pointer events, which trips userEvent.
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));

    const state = useStore.getState();
    expect(state.labels).toEqual(session.labels);
    expect(state.index).toBe(1);
    expect(state.pendingResume).toBeNull();
  });

  it('"Start fresh" clears the pending session and the saved session on disk', () => {
    const clearSession = vi.fn(async () => {});
    mockApi({ clearSession });
    useStore.setState({ pendingResume: session });
    render(<ResumeDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Start fresh" }));

    expect(useStore.getState().pendingResume).toBeNull();
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(useStore.getState().index).toBe(0); // saved position is discarded
  });

  it("Esc/overlay close defers (does NOT call clearSession)", () => {
    const clearSession = vi.fn(async () => {});
    mockApi({ clearSession });
    useStore.setState({ pendingResume: session });
    render(<ResumeDialog />);

    // Simulate Radix calling onOpenChange(false) — what happens on Esc or overlay click.
    // We fire an Escape keydown on the dialog content to trigger Radix's onOpenChange.
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });

    // pendingResume cleared (deferred) but clearSession NOT called
    expect(useStore.getState().pendingResume).toBeNull();
    expect(clearSession).not.toHaveBeenCalled();
  });
});
