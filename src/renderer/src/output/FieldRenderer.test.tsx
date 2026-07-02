import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadConfig } from "@core/config";
import type { OutputField } from "@core/config";
import { FieldRenderer } from "./FieldRenderer";

/** Parse a real config so every OutputField carries the Zod-applied defaults. */
function buildFields(): Map<string, OutputField> {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": {
      "fields": [
        { "name": "note", "control": "text", "labelPosition": "above" },
        { "name": "essay", "control": "textarea", "labelPosition": "above" },
        { "name": "score", "control": "number", "min": 0, "max": 10, "labelPosition": "above" },
        { "name": "when", "control": "date", "labelPosition": "above" },
        { "name": "flag", "control": "checkbox" },
        { "name": "flag-help", "control": "checkbox", "help": "Tooltip text here" },
        { "name": "verdict", "control": "radio", "options": [{ "value": "good", "displayName": "Good" }, { "value": "bad" }] },
        { "name": "bucket", "control": "select", "options": [{ "value": "a" }, { "value": "b" }] },
        { "name": "confidence", "control": "slider", "min": 0, "max": 100 },
        { "name": "code", "control": "text", "regex": "^[A-Z]{3}$", "labelPosition": "above" },
        { "name": "optional", "control": "text", "required": false, "labelPosition": "above" },
        { "name": "sideways", "control": "text", "labelPosition": "left" },
        { "name": "ghost", "control": "hidden" }
      ]
    }
  }`);
  if (!result.ok) throw new Error("invalid test config");
  return new Map(result.config.output.fields.map((f) => [f.name, f]));
}

const fields = buildFields();

function field(name: string): OutputField {
  const f = fields.get(name);
  if (!f) throw new Error(`unknown field ${name}`);
  return f;
}

afterEach(() => cleanup());

describe("FieldRenderer: rendering each control", () => {
  it("renders a text input", () => {
    render(<FieldRenderer field={field("note")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "note" })).toBeInTheDocument();
  });

  it("renders a textarea", () => {
    render(<FieldRenderer field={field("essay")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "essay" }).tagName).toBe("TEXTAREA");
  });

  it("renders a number input", () => {
    render(<FieldRenderer field={field("score")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("spinbutton", { name: "score" })).toBeInTheDocument();
  });

  it("renders a date input", () => {
    render(<FieldRenderer field={field("when")} value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText("when")).toHaveAttribute("type", "date");
  });

  it("renders a checkbox", () => {
    render(<FieldRenderer field={field("flag")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("renders one radio item per option", () => {
    render(<FieldRenderer field={field("verdict")} value={null} onChange={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("bad")).toBeInTheDocument(); // falls back to the raw value
  });

  it("renders a select trigger with its placeholder (shallow — no portal interaction)", () => {
    render(<FieldRenderer field={field("bucket")} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Select…")).toBeInTheDocument();
  });

  it("renders a slider with the current value readout", () => {
    render(<FieldRenderer field={field("confidence")} value={42} onChange={vi.fn()} />);
    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders no widget for a hidden field", () => {
    // Note: FieldRenderer still emits the label chrome for hidden fields; in the
    // real app OutputForm filters auto-copied (hidden) fields out entirely.
    const { container } = render(
      <FieldRenderer field={field("ghost")} value={null} onChange={vi.fn()} />,
    );
    expect(container.querySelector("input, textarea, select, button")).toBeNull();
  });
});

describe("FieldRenderer: change events", () => {
  it("text: typing emits the string, clearing emits null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldRenderer field={field("note")} value={null} onChange={onChange} />);
    await user.type(screen.getByRole("textbox", { name: "note" }), "a");
    expect(onChange).toHaveBeenLastCalledWith("a");

    cleanup();
    const onClear = vi.fn();
    render(<FieldRenderer field={field("note")} value="x" onChange={onClear} />);
    await user.clear(screen.getByRole("textbox", { name: "note" }));
    expect(onClear).toHaveBeenLastCalledWith(null);
  });

  it("number: typing emits a number, clearing emits null", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldRenderer field={field("score")} value={null} onChange={onChange} />);
    await user.type(screen.getByRole("spinbutton", { name: "score" }), "5");
    expect(onChange).toHaveBeenLastCalledWith(5);

    cleanup();
    const onClear = vi.fn();
    render(<FieldRenderer field={field("score")} value={5} onChange={onClear} />);
    await user.clear(screen.getByRole("spinbutton", { name: "score" }));
    expect(onClear).toHaveBeenLastCalledWith(null);
  });

  it("date: picking a day emits a Date, clearing emits null", () => {
    const onChange = vi.fn();
    render(<FieldRenderer field={field("when")} value={null} onChange={onChange} />);
    // fireEvent: happy-dom + userEvent don't support keyboard entry on type=date.
    fireEvent.change(screen.getByLabelText("when"), { target: { value: "2024-03-05" } });
    const emitted = onChange.mock.lastCall?.[0] as Date;
    expect(emitted).toBeInstanceOf(Date);
    expect(emitted.getFullYear()).toBe(2024);
    expect(emitted.getMonth()).toBe(2);
    expect(emitted.getDate()).toBe(5);

    cleanup();
    const onClear = vi.fn();
    render(<FieldRenderer field={field("when")} value={new Date(2024, 2, 5)} onChange={onClear} />);
    fireEvent.change(screen.getByLabelText("when"), { target: { value: "" } });
    expect(onClear).toHaveBeenLastCalledWith(null);
  });

  it("checkbox: clicking toggles the boolean", async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn();
    render(<FieldRenderer field={field("flag")} value={null} onChange={onCheck} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onCheck).toHaveBeenLastCalledWith(true);

    cleanup();
    const onUncheck = vi.fn();
    render(<FieldRenderer field={field("flag")} value={true} onChange={onUncheck} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onUncheck).toHaveBeenLastCalledWith(false);
  });

  it("checkbox with help: clicking the help trigger does NOT toggle the checkbox", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldRenderer field={field("flag-help")} value={null} onChange={onChange} />);
    // The help button must be OUTSIDE the <label>, so clicking it should not fire onChange.
    const helpBtn = screen.getByRole("button", { name: "Help" });
    await user.click(helpBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("radio: clicking an option emits its value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FieldRenderer field={field("verdict")} value={null} onChange={onChange} />);
    await user.click(screen.getByText("Good"));
    expect(onChange).toHaveBeenLastCalledWith("good");
  });
});

describe("FieldRenderer: label, validation, layout", () => {
  it("shows a * marker for required fields and none for optional ones", () => {
    render(<FieldRenderer field={field("note")} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("*")).toBeInTheDocument();

    cleanup();
    render(<FieldRenderer field={field("optional")} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("shows the message and a danger border for an out-of-range number", () => {
    render(<FieldRenderer field={field("score")} value={99} onChange={vi.fn()} />);
    expect(screen.getByText("Must be ≤ 10.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "score" }).className).toContain("border-danger");
  });

  it("shows the message and a danger border for a regex mismatch", () => {
    render(<FieldRenderer field={field("code")} value="abc" onChange={vi.fn()} />);
    expect(screen.getByText("Does not match the required format.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "code" }).className).toContain("border-danger");
  });

  it("shows no error for a valid provided value", () => {
    render(<FieldRenderer field={field("code")} value="ABC" onChange={vi.fn()} />);
    expect(screen.queryByText("Does not match the required format.")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "code" }).className).not.toContain("border-danger");
  });

  it('labelPosition "left" renders the side-by-side layout', () => {
    const { container } = render(
      <FieldRenderer field={field("sideways")} value={null} onChange={vi.fn()} />,
    );
    expect(container.querySelector(".w-40")).not.toBeNull();
  });

  it('labelPosition "above" stacks the label over the widget', () => {
    const { container } = render(
      <FieldRenderer field={field("note")} value={null} onChange={vi.fn()} />,
    );
    expect(container.querySelector(".w-40")).toBeNull();
    expect(container.querySelector(".flex-col")).not.toBeNull();
  });
});
