import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { AppConfig, IpcApi } from "@core";
import { loadConfig } from "@core/config";
import { useStore } from "../store/store";
import { useAnnouncer } from "../a11y/announcer";
import { LabelingView } from "./LabelingView";
import { LiveAnnouncer } from "../a11y/LiveAnnouncer";

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

function makeRecords(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    inputValues: { id: `row-${String(i)}` },
    labelValues: {},
    coercionErrors: [],
  }));
}

function mockApi(): void {
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => false,
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
    analyzeSplitFile: async () => ({ ok: false, canceled: true }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  };
  Object.defineProperty(window, "api", { value: base, configurable: true });
  Object.defineProperty(window, "platform", { value: "darwin", configurable: true });
}

describe("LabelingView announcements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApi();
    useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });
    useStore.setState({
      config: sampleConfig(),
      phase: "labeling",
      records: makeRecords(4),
      index: 0,
      labels: {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("has an sr-only h1 with text 'Labeling'", () => {
    render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Labeling");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("sr-only");
  });

  it("announces record navigation after 300ms debounce", () => {
    render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );

    // Before debounce fires, nothing announced.
    expect(useAnnouncer.getState().polite.message).toBe("");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // After debounce, initial position should be announced.
    expect(useAnnouncer.getState().polite.message).toBe("Record 1 of 4");
  });

  it("announces updated position when index changes", () => {
    render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(useAnnouncer.getState().polite.message).toBe("Record 1 of 4");

    act(() => {
      useStore.getState().next();
    });

    // Before debounce fires, still showing old message.
    expect(useAnnouncer.getState().polite.message).toBe("Record 1 of 4");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(useAnnouncer.getState().polite.message).toBe("Record 2 of 4");
  });

  it("announces 25% milestone when first record is labeled", () => {
    const records = makeRecords(4);
    const config = sampleConfig();
    useStore.setState({ records, config, index: 0, labels: {} });

    render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Reset after initial nav announcement.
    useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });

    // Label the first record (index 0).
    act(() => {
      useStore.getState().setLabel(0, "label", "yes");
    });

    expect(useAnnouncer.getState().polite.message).toBe("25% of records labeled");
  });

  it("does NOT re-announce the 25% milestone on subsequent labels", () => {
    const records = makeRecords(4);
    const config = sampleConfig();
    useStore.setState({ records, config, index: 0, labels: {} });

    render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Label first record — triggers 25%.
    act(() => {
      useStore.getState().setLabel(0, "label", "yes");
    });

    const afterFirst = useAnnouncer.getState().polite.seq;

    // Label another record — should NOT re-announce 25%.
    act(() => {
      useStore.getState().setLabel(1, "label", "yes");
    });

    // seq should only have changed for the 50% milestone, not 25% again.
    // The important thing: after labeling record 1, the message should be 50%.
    expect(useAnnouncer.getState().polite.message).toBe("50% of records labeled");
    // And the seq increased by exactly 1 more (just the 50% milestone).
    expect(useAnnouncer.getState().polite.seq).toBe(afterFirst + 1);
  });

  it("announces 'All records labeled' at 100%", () => {
    const records = makeRecords(2);
    const config = sampleConfig();
    useStore.setState({ records, config, index: 0, labels: {} });

    render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Label both records.
    act(() => {
      useStore.getState().setLabel(0, "label", "yes");
      useStore.getState().setLabel(1, "label", "yes");
    });

    expect(useAnnouncer.getState().polite.message).toBe("All records labeled");
  });
});
