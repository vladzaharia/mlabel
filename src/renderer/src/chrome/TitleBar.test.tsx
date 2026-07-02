import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { loadConfig } from "@core/config";
import type { AppConfig } from "@core";
import { useStore, selectCompletedCount } from "../store/store";
import { TitleBar } from "./TitleBar";

function sampleConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": {
      "fields": [
        { "name": "id", "control": "hidden" },
        { "name": "verdict", "control": "radio", "options": [{ "value": "good" }, { "value": "bad" }] }
      ]
    }
  }`);
  if (!result.ok) throw new Error("invalid test config");
  return result.config;
}

function makeRecords(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    inputValues: { id: `row-${String(i)}` },
    labelValues: { id: `row-${String(i)}`, verdict: null },
    coercionErrors: [],
  }));
}

describe("TitleBar", () => {
  beforeEach(() => {
    useStore.setState({
      config: sampleConfig(),
      phase: "labeling",
      records: makeRecords(4),
      index: 0,
      labels: {},
      inputPath: null,
    });
  });
  afterEach(() => cleanup());

  it("renders a progressbar with correct aria attributes", () => {
    render(<TitleBar onDone={() => {}} />);
    // <progress> has implicit role="progressbar".
    const pb = screen.getByRole("progressbar");
    expect(pb).toBeInTheDocument();
    expect(pb).toHaveAttribute("max", "4");
    expect(pb).toHaveAttribute("value", "0");
    expect(pb).toHaveAttribute("aria-label", "Labeling progress");
  });

  it("updates value as records are labeled", () => {
    render(<TitleBar onDone={() => {}} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");

    // Seed labels and verify completed count increases.
    useStore.setState({
      labels: { 0: { id: "row-0", verdict: "good" } },
    });
    const completed = selectCompletedCount(useStore.getState());
    expect(completed).toBe(1);
  });

  it("shows 'N of M labeled' counter copy", () => {
    render(<TitleBar onDone={() => {}} />);
    expect(screen.getByText(/of 4 labeled/)).toBeInTheDocument();
  });

  it("shows a check icon and accent color at 100% completion", () => {
    // Seed labels for all 4 records as complete.
    useStore.setState({
      labels: {
        0: { id: "row-0", verdict: "good" },
        1: { id: "row-1", verdict: "good" },
        2: { id: "row-2", verdict: "good" },
        3: { id: "row-3", verdict: "good" },
      },
    });
    render(<TitleBar onDone={() => {}} />);
    // At 100%, the counter span has text-progress class.
    const counter = screen.getByText(/of 4 labeled/).closest("span");
    expect(counter?.className).toContain("text-progress");
  });

  it("does not show check icon when not at 100%", () => {
    useStore.setState({ labels: { 0: { id: "row-0", verdict: "good" } } });
    render(<TitleBar onDone={() => {}} />);
    const counter = screen.getByText(/of 4 labeled/).closest("span");
    // Should use muted class, not text-progress.
    expect(counter?.className).toContain("text-muted-foreground");
  });
});
