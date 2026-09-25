import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ValueTypeShape } from "@core/config";
import type { Decoration } from "@core";
import { ValueView } from "./ValueView";

afterEach(() => cleanup());

/** An array-of-object table whose single column combines the named fields. */
const withColumn = (use: string[]): ValueTypeShape => ({
  type: "array",
  items: {
    type: "object",
    fields: [
      { name: "name", display: { title: "Check" }, type: "text" },
      { name: "toxic", display: { title: "Toxic" }, type: "boolean" },
      { name: "pii", display: { title: "PII" }, type: "boolean" },
    ],
    table: { columns: [{ name: "col", use, display: { title: "Col" } }] },
  },
});

describe("ValueView — dates", () => {
  const date: ValueTypeShape = { type: "date" };

  it("renders the calendar day the source named, not the one local time falls on", () => {
    const value = new Date("2026-05-01T00:00:00Z");
    render(<ValueView type={date} value={value} />);
    expect(
      screen.getByText(value.toLocaleDateString(undefined, { timeZone: "UTC" })),
    ).toBeInTheDocument();
    // The test timezone is west of UTC, so the local reading is the day before.
    expect(screen.queryByText(value.toLocaleDateString())).not.toBeInTheDocument();
  });

  it("shows no time for a date-only value", () => {
    render(<ValueView type={date} value={new Date("2026-05-01T00:00:00Z")} />);
    expect(screen.getByText(/2026/)).not.toHaveTextContent(":");
  });

  it("shows the time when the value carries one", () => {
    const value = new Date("2026-05-01T14:30:00Z");
    render(<ValueView type={date} value={value} />);
    expect(
      screen.getByText(value.toLocaleString(undefined, { timeZone: "UTC" })),
    ).toBeInTheDocument();
  });

  it("falls back to the raw text for an unreadable value", () => {
    render(<ValueView type={date} value={"whenever" as never} />);
    expect(screen.getByText("whenever")).toBeInTheDocument();
  });
});

describe("ValueView — per-item decorations", () => {
  const list: ValueTypeShape = {
    type: "array",
    items: {
      type: "object",
      fields: [{ name: "email", display: { title: "Email" }, type: "text" }],
    },
  };
  const value = [{ email: "a@acme.com" }, { email: "b@other.com" }];
  const flagged: Decoration[][] = [
    [{ rule: "same-domain", style: { tone: "warning", note: "Same domain." } }],
    [],
  ];

  it("marks only the rows a rule matched", () => {
    render(<ValueView type={list} value={value} itemDecorations={flagged} />);
    const rows = screen.getAllByRole("row").slice(1); // drop the header
    expect(rows[0]?.className).toContain("border-warning");
    expect(rows[1]?.className).not.toContain("border-warning");
  });

  it("shows the note beside the value it explains", () => {
    render(<ValueView type={list} value={value} itemDecorations={flagged} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Same domain.")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("Same domain.")).toBeNull();
  });

  it("renders exactly as before when no rule iterated the list", () => {
    render(<ValueView type={list} value={value} />);
    expect(screen.getByText("a@acme.com")).toBeInTheDocument();
    expect(screen.queryByText("Same domain.")).toBeNull();
  });
});

// The shape a "last ten emails" column actually has: one CSV cell of
// comma-joined addresses, read as a list of strings. `forEach` can iterate it,
// so the chips have to be able to show what it found — without this the rule
// fires, the decorations are produced, and nothing appears on screen.
describe("ValueView — per-item decorations on a list of scalars", () => {
  const list: ValueTypeShape = { type: "array", items: { type: "text" } };
  const value = ["a@acme.com", "b@other.com", "c@acme.com"];
  const flagged: Decoration[][] = [
    [{ rule: "same-domain", style: { tone: "warning", note: "Same domain as this account." } }],
    [],
    [{ rule: "same-domain", style: { tone: "warning", note: "Same domain as this account." } }],
  ];

  const chipFor = (text: string): HTMLElement | null =>
    screen.getByText(text).closest("[data-item]");

  it("tints only the entries a rule matched", () => {
    render(<ValueView type={list} value={value} itemDecorations={flagged} />);
    expect(chipFor("a@acme.com")?.className).toContain("border-warning");
    expect(chipFor("b@other.com")?.className).not.toContain("border-warning");
    expect(chipFor("c@acme.com")?.className).toContain("border-warning");
  });

  // Ten chips each carrying the same sentence would drown the values they are
  // about, so the note is a hover title and an `sr-only` line rather than
  // visible text on every one.
  it("carries the note without printing it ten times", () => {
    render(<ValueView type={list} value={value} itemDecorations={flagged} />);
    expect(chipFor("a@acme.com")).toHaveAttribute("title", "Same domain as this account.");
  });

  it("announces the note to a screen reader", () => {
    render(<ValueView type={list} value={value} itemDecorations={flagged} />);
    expect(screen.getAllByText("Same domain as this account.")).toHaveLength(2);
  });

  it("leaves an undecorated list unmarked", () => {
    render(<ValueView type={list} value={value} />);
    expect(chipFor("a@acme.com")?.className).not.toContain("border-warning");
    expect(screen.queryByText("Same domain as this account.")).toBeNull();
  });

  // Every entry used to sit in a filled chip, so a list of ten read as ten
  // highlights and the four that meant something did not stand out at all.
  // Framing is what a rule adds; without one an entry is just a value.
  it("gives an unflagged entry no frame of its own", () => {
    render(<ValueView type={list} value={value} itemDecorations={flagged} />);
    const plain = chipFor("b@other.com")?.className ?? "";
    expect(plain).not.toMatch(/\bborder-/);
    expect(plain).not.toMatch(/\bbg-muted\b/);
  });

  // A guess must never be mistakable for a rule the config author wrote.
  it("draws a model's mark differently from an authored one", () => {
    const fromModel: Decoration[][] = [
      [{ rule: "ai", source: "model", style: { tone: "warning", note: "Looks odd." } }],
      [],
      [],
    ];
    render(<ValueView type={list} value={value} itemDecorations={fromModel} />);
    expect(chipFor("a@acme.com")?.className).toContain("border-dashed");
  });
});

describe("ValueView", () => {
  it("renders an em-dash for empty values", () => {
    render(<ValueView type={{ type: "text" }} value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders an enum's display name, not its value", () => {
    const type: ValueTypeShape = {
      type: "enum",
      choices: [{ name: "good", display: { title: "Looks good" } }],
    };
    render(<ValueView type={type} value="good" />);
    expect(screen.getByText("Looks good")).toBeInTheDocument();
  });

  it("renders an array of scalars as chips", () => {
    render(<ValueView type={{ type: "array", items: { type: "text" } }} value={["a", "b"]} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("renders an array of objects as a table with field columns", () => {
    const type: ValueTypeShape = {
      type: "array",
      items: {
        type: "object",
        fields: [
          { name: "id", type: "number" },
          { name: "label", display: { title: "Label" }, type: "text" },
        ],
      },
    };
    render(<ValueView type={type} value={[{ id: 1, label: "x" }]} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Label")).toBeInTheDocument();
    expect(within(table).getByText("x")).toBeInTheDocument();
  });

  // A composite column captions itself in the header. Repeating that caption in
  // every cell reads as part of the data — "Check safety" instead of "safety".
  describe("composite columns", () => {
    const row = [{ name: "safety", toxic: false, pii: true }];

    it("omits the per-field label when the column shows a single field", () => {
      render(<ValueView type={withColumn(["name"])} value={row} />);
      const table = screen.getByRole("table");
      expect(within(table).getByText("safety")).toBeInTheDocument();
      // "Col" is the header; "Check" would be the field label leaking into the cell.
      expect(within(table).queryByText("Check")).not.toBeInTheDocument();
    });

    it("keeps per-field labels when the column combines several fields", () => {
      render(<ValueView type={withColumn(["name", "toxic"])} value={row} />);
      const table = screen.getByRole("table");
      expect(within(table).getByText("Check")).toBeInTheDocument();
      expect(within(table).getByText("Toxic")).toBeInTheDocument();
    });

    // A lone tick with nothing beside it says nothing about which flag it is.
    it("keeps a boolean's label even when it is the only field", () => {
      render(<ValueView type={withColumn(["toxic"])} value={row} />);
      expect(within(screen.getByRole("table")).getByText("Toxic")).toBeInTheDocument();
    });
  });

  it("renders map<K,object> as a table with a bold key column", () => {
    const type: ValueTypeShape = {
      type: "map",
      values: { type: "object", fields: [{ name: "score", type: "number" }] },
    };
    render(<ValueView type={type} value={{ alice: { score: 9 } }} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Key")).toBeInTheDocument();
    // The class sits on the <td>; cell contents live in an inner element that
    // caps their width so one long value can't stretch the table forever.
    const keyCell = within(table).getByText("alice").closest("td");
    expect(keyCell?.className).toContain("font-semibold");
    expect(within(table).getByText("9")).toBeInTheDocument();
  });

  it("renders map<K,scalar> as a two-column key/value table", () => {
    const type: ValueTypeShape = { type: "map", values: { type: "number" } };
    render(<ValueView type={type} value={{ x: 1, y: 2 }} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Value")).toBeInTheDocument();
    expect(within(table).getByText("x")).toBeInTheDocument();
    expect(within(table).getByText("2")).toBeInTheDocument();
  });
});
