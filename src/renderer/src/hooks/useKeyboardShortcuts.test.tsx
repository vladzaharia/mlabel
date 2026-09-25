import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LabelMap, RecordView } from "@core";
import { loadConfig } from "@core/config";
import { buildConfig, configObject } from "@test/fixtures/config";
import { useStore } from "../store/store";
import { isMac } from "../lib/utils";
import { RadioWidget, SliderWidget } from "../output/widgets";
import { ShortcutProvider } from "../shortcuts/ShortcutProvider";
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

/**
 * The hook reads its bindings from the provider, exactly as the app composes
 * them — so these tests exercise the real resolution, overrides included,
 * rather than a table assembled just for the test.
 */
function Wrapped(props: { onDone: () => void; onToggleHelp?: () => void }): React.JSX.Element {
  return (
    <ShortcutProvider>
      <Harness {...props} />
    </ShortcutProvider>
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
    render(<Wrapped onDone={onDone} onToggleHelp={onToggleHelp} />);
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
    press(input, "Enter", isMac() ? { metaKey: true } : { ctrlKey: true });
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
        <Wrapped onDone={onDone} onToggleHelp={onToggleHelp} />
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
    render(<Wrapped onDone={onDone} onToggleHelp={onToggleHelp} />);
    press(window, "ArrowRight");
    expect(useStore.getState().index).toBe(1);
  });
});

describe("useKeyboardShortcuts: Enter and gap navigation", () => {
  const onDone = vi.fn();

  beforeEach(() => {
    const labels: Record<number, LabelMap> = {};
    for (const record of records) labels[record.index] = { ...record.labelValues };
    // Record 1 is finished; 0 and 2 are not, so a sweep must skip past 1.
    labels[1] = { id: "1", verdict: "good", score: 5 };
    useStore.setState({ config, records, index: 0, labels, prefill: {}, phase: "labeling" });
    render(<Wrapped onDone={onDone} />);
  });

  afterEach(() => {
    cleanup();
    onDone.mockReset();
  });

  it("advances the record on Enter", () => {
    press(window, "Enter");
    expect(useStore.getState().index).toBe(1);
  });

  // Enter on a focused button already activates it; advancing as well would
  // mean "Previous record" went back one and forward one.
  it("leaves Enter alone when a button has focus", () => {
    const button = document.createElement("button");
    document.body.append(button);
    press(button, "Enter");
    expect(useStore.getState().index).toBe(0);
    button.remove();
  });

  it("leaves Enter alone in a textarea, where it means a newline", () => {
    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    press(textarea, "Enter");
    expect(useStore.getState().index).toBe(0);
    textarea.remove();
  });

  it("does not advance on an IME commit", () => {
    press(window, "Enter", { isComposing: true } as KeyboardEventInit);
    expect(useStore.getState().index).toBe(0);
  });

  it("does not advance on Shift+Enter", () => {
    press(window, "Enter", { shiftKey: true });
    expect(useStore.getState().index).toBe(0);
  });

  it("still exports on mod+Enter rather than advancing", () => {
    press(window, "Enter", isMac() ? { metaKey: true } : { ctrlKey: true });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(useStore.getState().index).toBe(0);
  });

  it("skips finished records when sweeping forward", () => {
    press(window, "ArrowRight", { shiftKey: true });
    expect(useStore.getState().index).toBe(2);
  });

  it("sweeps backward too", () => {
    useStore.setState({ index: 2 });
    press(window, "ArrowLeft", { shiftKey: true });
    expect(useStore.getState().index).toBe(0);
  });

  it("stays put when there is no gap left in that direction", () => {
    useStore.setState({ index: 2 });
    press(window, "ArrowRight", { shiftKey: true });
    expect(useStore.getState().index).toBe(2);
  });
});

// ─── Config-declared choice chords ───────────────────────────────────────────

/**
 * Choice chords are app-wide: a labeler answers without tabbing to the question
 * first. The only place they stand down is text entry, where a bare letter is
 * indistinguishable from typing that letter.
 */
function ChordHarness(): React.JSX.Element {
  useKeyboardShortcuts({ onDone: vi.fn() });
  return <input aria-label="notes" />;
}

function WrappedChordHarness(): React.JSX.Element {
  return (
    <ShortcutProvider>
      <ChordHarness />
    </ShortcutProvider>
  );
}

const chordLabels = (): LabelMap => useStore.getState().labels[0] ?? {};

describe("useKeyboardShortcuts: choice chords fire app-wide", () => {
  const chordConfig = (() => {
    const raw = configObject({
      output: [
        {
          name: "verdict",
          kind: "choice",
          choices: [
            { value: "good", shortcut: "g" },
            { value: "bad", shortcut: "mod+b" },
          ],
        },
      ],
    }) as Record<string, Record<string, unknown[]>>;
    // A multi-select has no fixture kind; write the array-of-enum shape directly.
    raw["output"]!["fields"]!.push({
      name: "topics",
      type: "array",
      widget: "checkboxes",
      required: false,
      items: {
        type: "enum",
        choices: [
          { name: "billing", shortcut: "b" },
          { name: "outage", shortcut: "o" },
        ],
      },
    });
    const result = loadConfig(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.issues.map((i) => i.message).join("; "));
    return result.config;
  })();

  const chordRecords: RecordView[] = [
    { index: 0, inputValues: {}, labelValues: { verdict: null, topics: null }, coercionErrors: [] },
  ];

  beforeEach(() => {
    useStore.setState({
      config: chordConfig,
      records: chordRecords,
      index: 0,
      labels: { 0: {} },
      phase: "labeling",
    });
    render(<WrappedChordHarness />);
  });

  afterEach(() => cleanup());

  it("selects a choice with the caret nowhere near the field", () => {
    press(window, "g");
    expect(chordLabels()["verdict"]).toBe("good");
  });

  it("holds a bare chord back while typing, so the letter can be typed", () => {
    press(screen.getByLabelText("notes"), "g");
    expect(chordLabels()["verdict"]).toBeUndefined();
  });

  it("still fires a modifier chord from inside a text field", () => {
    // `mod` is Cmd on macOS and Ctrl elsewhere; send whichever this run means.
    press(screen.getByLabelText("notes"), "b", isMac() ? { metaKey: true } : { ctrlKey: true });
    expect(chordLabels()["verdict"]).toBe("bad");
  });

  it("toggles a multi-select choice on, then back off", () => {
    press(window, "b");
    expect(chordLabels()["topics"]).toEqual(["billing"]);
    press(window, "b");
    expect(chordLabels()["topics"]).toBeNull();
  });

  it("keeps declaration order when a second multi-select choice is added", () => {
    press(window, "o");
    press(window, "b");
    expect(chordLabels()["topics"]).toEqual(["billing", "outage"]);
  });
});

/** Dispatch and report whether anything consumed the keystroke. */
function pressFor(target: Element | Window, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  const notCancelled = target.dispatchEvent(event);
  return !notCancelled;
}

describe("useKeyboardShortcuts: Space advances", () => {
  beforeEach(() => {
    useStore.setState({ config, records, index: 0, labels: { 0: {} }, phase: "labeling" });
    render(<Wrapped onDone={vi.fn()} />);
  });
  afterEach(() => cleanup());

  it("moves to the next record", () => {
    press(window, " ");
    expect(useStore.getState().index).toBe(1);
  });

  it("consumes the keystroke, so the pane does not also scroll", () => {
    expect(pressFor(window, " ")).toBe(true);
  });

  it("leaves Space alone where it already activates something", () => {
    const radio = screen.getAllByRole("radio")[0]!;
    press(radio, " ");
    expect(useStore.getState().index).toBe(0);
  });

  it("types a space in a text field instead of advancing", () => {
    press(screen.getByLabelText("text field"), " ");
    expect(useStore.getState().index).toBe(0);
  });

  // A link scrolls on Space rather than activating, so the record should still
  // move — this is why the Space and Enter guard lists differ.
  it("still advances from a link, which only scrolls on Space", () => {
    const link = document.createElement("a");
    link.href = "#x";
    document.body.append(link);
    press(link, " ");
    expect(useStore.getState().index).toBe(1);
    link.remove();
  });
});

describe("useKeyboardShortcuts: keystrokes that must not be swallowed", () => {
  beforeEach(() => {
    useStore.setState({ config, records, index: 0, labels: { 0: {} }, phase: "labeling" });
    render(<Wrapped onDone={vi.fn()} onToggleHelp={vi.fn()} />);
  });
  afterEach(() => cleanup());

  // The arrows have to keep scrolling the input pane while they also move
  // through records, and `?` must not be eaten before anything else sees it.
  it("navigates without consuming the arrow keys", () => {
    expect(pressFor(window, "ArrowRight")).toBe(false);
    expect(useStore.getState().index).toBe(1);
    expect(pressFor(window, "ArrowLeft")).toBe(false);
    expect(useStore.getState().index).toBe(0);
  });

  it("opens help without consuming the key", () => {
    expect(pressFor(window, "?", { shiftKey: true })).toBe(false);
  });
});

describe("useKeyboardShortcuts: user overrides", () => {
  afterEach(() => {
    cleanup();
    useStore.setState({ shortcutOverrides: {} });
  });

  it("fires the action from the rebound key", () => {
    useStore.setState({
      config,
      records,
      index: 0,
      labels: { 0: {} },
      phase: "labeling",
      shortcutOverrides: { "nav.next": ["n"] },
    });
    render(<Wrapped onDone={vi.fn()} />);
    press(window, "n");
    expect(useStore.getState().index).toBe(1);
  });

  it("stops firing it from the default key, because an override replaces", () => {
    useStore.setState({
      config,
      records,
      index: 0,
      labels: { 0: {} },
      phase: "labeling",
      shortcutOverrides: { "nav.next": ["n"] },
    });
    render(<Wrapped onDone={vi.fn()} />);
    press(window, "ArrowRight");
    expect(useStore.getState().index).toBe(0);
  });

  // Distinct from "absent": the labeler deliberately took the key away.
  it("fires nothing for an action bound to no key at all", () => {
    const onToggleHelp = vi.fn();
    useStore.setState({
      config,
      records,
      index: 0,
      labels: { 0: {} },
      phase: "labeling",
      shortcutOverrides: { "app.help": [] },
    });
    render(<Wrapped onDone={vi.fn()} onToggleHelp={onToggleHelp} />);
    press(window, "?", { shiftKey: true });
    expect(onToggleHelp).not.toHaveBeenCalled();
  });
});
