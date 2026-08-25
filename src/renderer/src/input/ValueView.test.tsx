import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ValueTypeShape } from "@core/config";
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
