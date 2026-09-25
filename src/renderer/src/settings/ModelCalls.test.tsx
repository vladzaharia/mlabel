import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ModelCallEntry } from "@core";
import { ModelCalls } from "./ModelCalls";

const call = (over: Partial<ModelCallEntry> = {}): ModelCallEntry => ({
  id: 1,
  at: Date.parse("2026-05-01T12:00:00Z"),
  recordIndex: 0,
  modelId: "qwen3.5-2b",
  status: "clean",
  prefix: "You are helping a human reviewer read one row.",
  suffix: "The row to review:\nemail: a@b.com",
  findings: [],
  ...over,
});

afterEach(() => cleanup());

describe("ModelCalls", () => {
  it("says so plainly before anything has run", () => {
    render(<ModelCalls entries={[]} />);
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("lists a row per call, newest first", () => {
    render(
      <ModelCalls
        entries={[
          call({ id: 1, recordIndex: 0 }),
          call({ id: 2, recordIndex: 1, status: "failed", error: "boom" }),
        ]}
      />,
    );
    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Record 2");
    expect(rows[1]).toHaveTextContent("Record 1");
  });

  it("counts the notes a call produced", () => {
    render(
      <ModelCalls
        entries={[
          call({
            status: "findings",
            findings: [
              { field: "email", severity: "warning", reason: "Throwaway." },
              { severity: "info", reason: "Odd hour." },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText("2 notes")).toBeInTheDocument();
  });

  it("distinguishes a clean run from a failed one", () => {
    render(
      <ModelCalls entries={[call({ id: 1 }), call({ id: 2, status: "failed", error: "boom" })]} />,
    );
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows a call still in flight rather than leaving a gap", () => {
    render(<ModelCalls entries={[call({ status: "running" })]} />);
    expect(screen.getByText("Running…")).toBeInTheDocument();
  });
});

// The callout tells a labeler the results may be wrong and to verify them.
// That is only followable if the prompt is inspectable: the failure modes are a
// value truncated out of the prompt and a misleading `ai.context`, and neither
// is visible from the finding alone.
describe("ModelCalls — opening one", () => {
  it("shows the record as the model saw it", async () => {
    const user = userEvent.setup();
    render(<ModelCalls entries={[call()]} />);
    await user.click(screen.getByRole("button", { name: /Record 1/ }));
    expect(screen.getByText(/email: a@b.com/)).toBeInTheDocument();
  });

  it("shows the instructions it was given", async () => {
    const user = userEvent.setup();
    render(<ModelCalls entries={[call()]} />);
    await user.click(screen.getByRole("button", { name: /Record 1/ }));
    expect(screen.getByText(/You are helping a human reviewer/)).toBeInTheDocument();
  });

  it("shows the raw reply, before any parsing", async () => {
    const user = userEvent.setup();
    render(<ModelCalls entries={[call({ raw: '{"reasoning":"x","findings":[]}' })]} />);
    await user.click(screen.getByRole("button", { name: /Record 1/ }));
    expect(screen.getByText(/"reasoning":"x"/)).toBeInTheDocument();
  });

  it("explains a failure", async () => {
    const user = userEvent.setup();
    render(
      <ModelCalls
        entries={[call({ status: "failed", error: "The model’s answer was cut off." })]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Record 1/ }));
    expect(screen.getByText(/cut off/)).toBeInTheDocument();
  });

  it("goes back to the list", async () => {
    const user = userEvent.setup();
    render(<ModelCalls entries={[call()]} />);
    await user.click(screen.getByRole("button", { name: /Record 1/ }));
    await user.click(screen.getByRole("button", { name: /All calls/ }));
    expect(screen.getByText("Recent runs")).toBeInTheDocument();
  });
});
