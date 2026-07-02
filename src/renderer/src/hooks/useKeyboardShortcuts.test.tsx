import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { loadConfig } from "@core/config";
import type { AppConfig, LabelMap, RecordView } from "@core";
import { useStore } from "../store/store";
import { RadioWidget, SliderWidget } from "../output/widgets";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const config = loadAppConfig();

function loadAppConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": {
      "fields": [
        { "name": "id", "control": "hidden" },
        { "name": "verdict", "control": "radio", "options": [{ "value": "good" }, { "value": "bad" }] },
        { "name": "score", "control": "slider", "min": 0, "max": 100 }
      ]
    }
  }`);
  if (!result.ok) throw new Error("invalid test config");
  return result.config;
}

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
  const radioField = config.output.fields.find((f) => f.name === "verdict")!;
  const sliderField = config.output.fields.find((f) => f.name === "score")!;
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
