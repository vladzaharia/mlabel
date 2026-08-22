import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LabelMap, RecordView } from "@core";
import { buildConfig } from "@test/fixtures/config";
import { useStore } from "../store/store";
import { RadioWidget, SliderWidget } from "../output/widgets";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const config = buildConfig({
  output: [
    { name: "id", kind: "copied" },
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
    { name: "score", kind: "slider", min: 0, max: 100 },
  ],
});

const records: RecordView[] = [0, 1, 2].map((i) => ({
  index: i,
  inputValues: { id: String(i) },
  labelValues: { id: String(i), verdict: null, score: null },
  coercionErrors: [],
}));

/** Real Radix widgets so focus/role behavior matches the labeling screen. */
function Harness({
  onDone,
  onToggleHelp,
}: {
  onDone: () => void;
  onToggleHelp?: () => void;
}): React.JSX.Element {
  useKeyboardShortcuts({ onDone, onToggleHelp });
  // Narrowed by name: the widgets take the variant their type guarantees, which
  // a `find` over the union can't prove.
  const radioField = config.output.fields.find((f) => f.type === "enum")!;
  const sliderField = config.output.fields.find((f) => f.type === "number")!;
  return (
    <div>
      <input aria-label="text field" />
      <RadioWidget field={radioField} value={null} onChange={() => {}} />
      <SliderWidget field={sliderField} value={50} onChange={() => {}} />
    </div>
  );
}

function press(target: Element | Window, key: string, init: KeyboardEventInit = {}): void {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
}

const consume = (event: Event): void => event.preventDefault();

describe("useKeyboardShortcuts", () => {
  const onDone = vi.fn();
  const onToggleHelp = vi.fn();

  beforeEach(() => {
    const labels: Record<number, LabelMap> = {};
    for (const record of records) labels[record.index] = { ...record.labelValues };
    useStore.setState({ config, records, index: 0, labels, phase: "labeling" });
    render(<Harness onDone={onDone} onToggleHelp={onToggleHelp} />);
  });

  afterEach(() => {
    cleanup();
    onDone.mockReset();
    onToggleHelp.mockReset();
  });

  it("navigates records with arrow keys", () => {
    press(window, "ArrowRight");
    expect(useStore.getState().index).toBe(1);
    press(window, "ArrowLeft");
    expect(useStore.getState().index).toBe(0);
  });

  it("ignores arrow keys while typing in a text field", () => {
    const input = screen.getByLabelText("text field");
    press(input, "ArrowRight");
    expect(useStore.getState().index).toBe(0);
  });

  it("ignores arrow keys a widget already handled (defaultPrevented)", () => {
    // Radix widgets preventDefault on the keys they consume before the event
    // reaches the window listener; simulate that deterministically.
    const body = document.body;
    body.addEventListener("keydown", consume);
    press(body, "ArrowRight");
    body.removeEventListener("keydown", consume);
    expect(useStore.getState().index).toBe(0);
  });

  it("ignores arrow keys while an arrow-consuming widget is focused", () => {
    const radio = screen.getAllByRole("radio")[0]!;
    press(radio, "ArrowRight");
    const slider = screen.getByRole("slider");
    press(slider, "ArrowRight");
    expect(useStore.getState().index).toBe(0);
  });

  it("fires onDone for cmd/ctrl+Enter even while typing", () => {
    const input = screen.getByLabelText("text field");
    press(input, "Enter", { metaKey: true });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("selects the Nth option of the first visible radio/select with digits", () => {
    press(window, "2");
    expect(useStore.getState().labels[0]?.["verdict"]).toBe("bad");
  });

  it("ignores digits while a select-like widget is focused", () => {
    const radio = screen.getAllByRole("radio")[0]!;
    press(radio, "1");
    expect(useStore.getState().labels[0]?.["verdict"]).toBeNull();
  });

  it("fires onToggleHelp when '?' is pressed", () => {
    press(window, "?");
    expect(onToggleHelp).toHaveBeenCalledTimes(1);
  });

  it("suppresses onToggleHelp while typing in a text field", () => {
    const input = screen.getByLabelText("text field");
    press(input, "?");
    expect(onToggleHelp).not.toHaveBeenCalled();
  });
});

/**
 * A modal owns the keyboard while it is open. Radix traps Tab but not a window
 * listener, so before this guard the resume prompt was live-fire: 1–9 wrote
 * labels to the record behind it, and ⌘Enter exported *and* cleared the very
 * session the dialog was asking whether to restore.
 */
describe("useKeyboardShortcuts: an open dialog owns the keyboard", () => {
  const onDone = vi.fn();
  const onToggleHelp = vi.fn();

  function DialogHarness(): React.JSX.Element {
    return (
      <>
        <Harness onDone={onDone} onToggleHelp={onToggleHelp} />
        {/* Shaped exactly like a Radix dialog's content element — a native
            <dialog> would test markup the app never renders. */}
        {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <div role="dialog" data-state="open" aria-label="Resume?" />
      </>
    );
  }

  beforeEach(() => {
    const labels: Record<number, LabelMap> = {};
    for (const record of records) labels[record.index] = { ...record.labelValues };
    useStore.setState({ config, records, index: 0, labels, phase: "labeling" });
    render(<DialogHarness />);
  });

  afterEach(() => {
    cleanup();
    onDone.mockReset();
    onToggleHelp.mockReset();
  });

  it("does not write a label from a digit key", () => {
    press(window, "1");
    expect(useStore.getState().labels[0]?.["verdict"]).toBeNull();
  });

  it("does not export, which would clear the session being asked about", () => {
    press(window, "Enter", { metaKey: true });
    expect(onDone).not.toHaveBeenCalled();
  });

  it("does not navigate records", () => {
    press(window, "ArrowRight");
    expect(useStore.getState().index).toBe(0);
  });

  it("does not toggle the help dialog", () => {
    press(window, "?");
    expect(onToggleHelp).not.toHaveBeenCalled();
  });

  it("resumes handling once the dialog closes", () => {
    cleanup();
    render(<Harness onDone={onDone} onToggleHelp={onToggleHelp} />);
    press(window, "ArrowRight");
    expect(useStore.getState().index).toBe(1);
  });
});
