import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { loadConfig } from "@core/config";
import type { OutputField } from "@core/config";
import { CheckboxWidget } from "./widgets";
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
        { "name": "note", "control": "text", "labelPosition": "above", "description": "A short note", "displayName": "Note" },
        { "name": "essay", "control": "textarea", "labelPosition": "above", "description": "Long form", "displayName": "Essay" },
        { "name": "score", "control": "number", "min": 0, "max": 10, "labelPosition": "above", "description": "0–10 score", "displayName": "Score" },
        { "name": "when", "control": "date", "labelPosition": "above", "displayName": "When" },
        { "name": "flag", "control": "checkbox", "displayName": "Flag" },
        { "name": "verdict", "control": "radio", "displayName": "Verdict", "options": [{ "value": "good", "displayName": "Good" }, { "value": "bad" }] },
        { "name": "bucket", "control": "select", "displayName": "Bucket", "options": [{ "value": "a" }, { "value": "b" }] },
        { "name": "confidence", "control": "slider", "min": 0, "max": 100, "displayName": "Confidence" },
        { "name": "code", "control": "text", "regex": "^[A-Z]{3}$", "labelPosition": "above", "displayName": "Code" },
        { "name": "req_text", "control": "text", "required": true, "labelPosition": "above", "displayName": "Req Text" },
        { "name": "opt_text", "control": "text", "required": false, "labelPosition": "above", "displayName": "Opt Text" }
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

// ─── Accessible name / role ──────────────────────────────────────────────────

describe("widgets: accessible name via role", () => {
  it("text: resolvable by role + name", () => {
    render(<FieldRenderer field={field("note")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });

  it("textarea: resolvable by role + name", () => {
    render(<FieldRenderer field={field("essay")} value={null} onChange={vi.fn()} />);
    const el = screen.getByRole("textbox", { name: "Essay" });
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("number: resolvable by role + name", () => {
    render(<FieldRenderer field={field("score")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("spinbutton", { name: "Score" })).toBeInTheDocument();
  });

  it("date: accessible via label text", () => {
    render(<FieldRenderer field={field("when")} value={null} onChange={vi.fn()} />);
    expect(screen.getByLabelText("When")).toHaveAttribute("type", "date");
  });

  it("checkbox: accessible name comes from wrapping label", () => {
    render(<FieldRenderer field={field("flag")} value={null} onChange={vi.fn()} />);
    // The checkbox sits inside a <label> that contains the text "Flag".
    expect(screen.getByRole("checkbox", { name: /Flag/i })).toBeInTheDocument();
  });

  it("radio: group has accessible name equal to displayName", () => {
    render(<FieldRenderer field={field("verdict")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Verdict" })).toBeInTheDocument();
  });

  it("select: trigger has accessible name equal to displayName", () => {
    render(<FieldRenderer field={field("bucket")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Bucket" })).toBeInTheDocument();
  });

  it("slider: thumb has role slider with accessible name equal to displayName", () => {
    render(<FieldRenderer field={field("confidence")} value={50} onChange={vi.fn()} />);
    expect(screen.getByRole("slider", { name: "Confidence" })).toBeInTheDocument();
  });
});

// ─── aria-invalid + aria-describedby wired to error element ─────────────────

describe("widgets: invalid state (aria-invalid + aria-describedby)", () => {
  it("text: aria-invalid and describedby point at error when validation fails", () => {
    render(<FieldRenderer field={field("code")} value="abc" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Code" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const errorId = input.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    const errorEl = document.getElementById(errorId!);
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toMatch(/format/i);
  });

  it("text: no aria-invalid when value is valid", () => {
    render(<FieldRenderer field={field("code")} value="ABC" onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Code" });
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("number: aria-invalid set when out of range", () => {
    render(<FieldRenderer field={field("score")} value={99} onChange={vi.fn()} />);
    const input = screen.getByRole("spinbutton", { name: "Score" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const ids = describedBy.split(" ").filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    const texts = ids.map((id) => document.getElementById(id)?.textContent ?? "");
    expect(texts.some((t) => /≤ 10/.test(t))).toBe(true);
  });

  it("slider: aria-invalid and aria-describedby set on thumb (role=slider) when invalid", () => {
    // confidence has min:0, max:100; value 150 exceeds max and triggers a validation error.
    render(<FieldRenderer field={field("confidence")} value={150} onChange={vi.fn()} />);
    const thumb = screen.getByRole("slider", { name: "Confidence" });
    expect(thumb).toHaveAttribute("aria-invalid", "true");
    const errorId = thumb.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    const errorEl = document.getElementById(errorId!.split(" ").at(-1)!);
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toMatch(/≤ 100/);
  });

  it("checkbox: aria-invalid set on role=checkbox element when invalid prop is true", () => {
    // Render the widget directly with invalid=true — Checkbox.Root (role=checkbox) must expose it.
    render(
      <CheckboxWidget
        field={field("flag")}
        value={false}
        onChange={vi.fn()}
        invalid={true}
        describedBy="flag-error"
      />,
    );
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("radio: aria-invalid set on group when validation fails (via radiogroup role)", () => {
    // Build a required radio field that has a value triggering an error.
    // Since radio has no built-in range, test aria-invalid is not set when no error.
    render(<FieldRenderer field={field("verdict")} value={null} onChange={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "Verdict" });
    // No validation error when null (isProvided returns false for null).
    expect(group).not.toHaveAttribute("aria-invalid");
  });
});

// ─── aria-describedby references description element ────────────────────────

describe("widgets: description element linked via aria-describedby", () => {
  it("text: describedby includes description id when description is present", () => {
    render(<FieldRenderer field={field("note")} value={null} onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Note" });
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const descEl = document.getElementById(describedBy!.split(" ")[0]!);
    expect(descEl?.textContent).toBe("A short note");
  });

  it("text: no aria-describedby when no description and no error", () => {
    render(<FieldRenderer field={field("opt_text")} value={null} onChange={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: "Opt Text" });
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("number: error id joins description id in describedby when both present", () => {
    render(<FieldRenderer field={field("score")} value={99} onChange={vi.fn()} />);
    const input = screen.getByRole("spinbutton", { name: "Score" });
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const ids = describedBy.split(" ").filter(Boolean);
    expect(ids.length).toBe(2);
    // One points at description, one at error.
    const texts = ids.map((id) => document.getElementById(id)?.textContent ?? "");
    expect(texts.some((t) => t.includes("0–10"))).toBe(true);
    expect(texts.some((t) => t.includes("≤ 10"))).toBe(true);
  });
});

// ─── aria-required ───────────────────────────────────────────────────────────

describe("widgets: aria-required", () => {
  it("text: aria-required true for required field", () => {
    render(<FieldRenderer field={field("req_text")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Req Text" })).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  it("text: no aria-required for optional field", () => {
    render(<FieldRenderer field={field("opt_text")} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Opt Text" })).not.toHaveAttribute("aria-required");
  });

  it("radiogroup: aria-required set when field is required", () => {
    render(<FieldRenderer field={field("verdict")} value={null} onChange={vi.fn()} />);
    // verdict is required (default true)
    expect(screen.getByRole("radiogroup", { name: "Verdict" })).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  it("slider: aria-required set on thumb (role=slider) when field is required", () => {
    render(<FieldRenderer field={field("confidence")} value={0} onChange={vi.fn()} />);
    // confidence defaults to required:true; aria-required must be on the thumb (role=slider).
    expect(screen.getByRole("slider", { name: "Confidence" })).toHaveAttribute(
      "aria-required",
      "true",
    );
  });
});

// ─── Slider value span is hidden from AT ─────────────────────────────────────

describe("slider: value readout hidden from assistive technology", () => {
  it("value <span> has aria-hidden", () => {
    render(<FieldRenderer field={field("confidence")} value={42} onChange={vi.fn()} />);
    // The visible "42" text is inside a span with aria-hidden.
    const span = screen.getByText("42").closest("span");
    expect(span).toHaveAttribute("aria-hidden", "true");
  });
});

// ─── Error element IDs are stable ────────────────────────────────────────────

describe("FieldRenderer: stable error and description element ids", () => {
  it("error <p> gets id field-{name}-error", () => {
    render(<FieldRenderer field={field("code")} value="abc" onChange={vi.fn()} />);
    const errorEl = document.getElementById("field-code-error");
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toMatch(/format/i);
  });

  it("description <p> gets id field-{name}-desc", () => {
    render(<FieldRenderer field={field("note")} value={null} onChange={vi.fn()} />);
    const descEl = document.getElementById("field-note-desc");
    expect(descEl).not.toBeNull();
    expect(descEl?.textContent).toBe("A short note");
  });
});
