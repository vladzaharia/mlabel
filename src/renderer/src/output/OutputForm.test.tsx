import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecordView } from "@core";
import { buildConfig } from "@test/fixtures/config";
import { useStore } from "../store/store";
import { OutputForm } from "./OutputForm";

const config = buildConfig({
  output: [
    { name: "id", kind: "copied" },
    {
      name: "verdict",
      kind: "choice",
      choices: [
        { value: "good", label: "Good" },
        { value: "bad", label: "Bad" },
      ],
    },
    { name: "score", kind: "number", min: 0, max: 10, required: false },
  ],
});

const records: RecordView[] = [
  {
    index: 0,
    inputValues: { id: "1" },
    labelValues: { id: "1", verdict: null, score: null },
    coercionErrors: [],
  },
];

describe("OutputForm", () => {
  beforeEach(() => {
    useStore.setState({
      config,
      records,
      index: 0,
      labels: { 0: { id: "1", verdict: null, score: null } },
      phase: "labeling",
    });
  });
  afterEach(() => cleanup());

  it("renders visible widgets but not auto-copied (hidden) fields", () => {
    render(<OutputForm />);
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Bad")).toBeInTheDocument();
    // The hidden 'id' field has no widget/label.
    expect(screen.queryByText("id")).not.toBeInTheDocument();
  });

  it("updates the store when a radio option is chosen", async () => {
    const user = userEvent.setup();
    render(<OutputForm />);
    await user.click(screen.getByText("Good"));
    expect(useStore.getState().labels[0]?.verdict).toBe("good");
  });

  it("shows a validation error for an out-of-range number", async () => {
    const user = userEvent.setup();
    render(<OutputForm />);
    await user.type(screen.getByRole("spinbutton"), "99");
    expect(await screen.findByText(/Must be ≤ 10/)).toBeInTheDocument();
  });
});
