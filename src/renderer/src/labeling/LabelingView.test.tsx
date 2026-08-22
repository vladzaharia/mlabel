import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildConfig } from "@test/fixtures/config";
import { installIpcApi } from "@test/fixtures/ipc";
import { useStore } from "../store/store";
import { useAnnouncer } from "../a11y/announcer";
import { LabelingView } from "./LabelingView";
import { LiveAnnouncer } from "../a11y/LiveAnnouncer";
import { debounce } from "../lib/utils";

const config = buildConfig();

function makeRecords(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    inputValues: { id: `row-${String(i)}` },
    labelValues: {},
    coercionErrors: [],
  }));
}

const mockApi = (): void => void installIpcApi({ getTheme: async () => false });

describe("LabelingView announcements", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockApi();
    useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });
    useStore.setState({
      config,
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

  it("does not announce navigation after unmount before debounce elapses", () => {
    const { unmount } = render(
      <>
        <LiveAnnouncer />
        <LabelingView onDone={() => {}} />
      </>,
    );

    // Unmount before the 300ms debounce fires.
    unmount();

    // Advance past the debounce window — the pending timer should have been cancelled.
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(useAnnouncer.getState().polite.message).toBe("");
  });
});

describe("LabelingView: empty-records state", () => {
  beforeEach(() => {
    mockApi();
    useStore.setState({
      config,
      phase: "labeling",
      records: [],
      index: 0,
      labels: {},
    });
  });
  afterEach(() => cleanup());

  it("renders a fallback message when records is empty", () => {
    render(<LabelingView onDone={() => {}} />);
    expect(screen.getByText(/No records to label in this file/)).toBeInTheDocument();
  });

  it("renders a 'Choose another file' button that calls backToInput", () => {
    const backToInput = vi.fn();
    useStore.setState({ backToInput });
    render(<LabelingView onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose another file" }));
    expect(backToInput).toHaveBeenCalledOnce();
  });

  it("does not render the TitleBar or BottomBar in empty state", () => {
    render(<LabelingView onDone={() => {}} />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });
});

describe("LabelingView: export error banner", () => {
  beforeEach(() => {
    mockApi();
    useStore.setState({
      config,
      phase: "labeling",
      records: makeRecords(2),
      index: 0,
      labels: {},
      exportError: null,
    });
  });
  afterEach(() => cleanup());

  it("renders nothing when exportError is null", () => {
    render(<LabelingView onDone={() => {}} />);
    expect(screen.queryByText(/Export failed/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows the error message in a banner when exportError is set", () => {
    useStore.setState({ exportError: "Disk full" });
    render(<LabelingView onDone={() => {}} />);
    expect(screen.getByText("Disk full")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("dismiss button clears exportError", () => {
    useStore.setState({ exportError: "Disk full" });
    render(<LabelingView onDone={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss export error" }));
    expect(useStore.getState().exportError).toBeNull();
  });

  it("Try again button invokes the onDone callback", () => {
    const onDone = vi.fn();
    useStore.setState({ exportError: "Disk full" });
    render(<LabelingView onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe("debounce.cancel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels a pending invocation so the callback never runs", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced("a");
    debounced.cancel();

    vi.advanceTimersByTime(300);

    expect(fn).not.toHaveBeenCalled();
  });

  it("is a no-op when called with no pending timer", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    // cancel before any call — should not throw
    expect(() => {
      debounced.cancel();
    }).not.toThrow();
  });

  it("allows new invocations after cancel", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced("first");
    debounced.cancel();

    debounced("second");
    vi.advanceTimersByTime(200);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("second");
  });
});
