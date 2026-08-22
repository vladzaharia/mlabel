import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ValueTypeShape } from "@core/config";
import { ValueView } from "./ValueView";

afterEach(() => cleanup());

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
