import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Card, InputField } from "@core/config";
import type { Decorations } from "@core";
import { CategoryCard } from "./CategoryCard";

afterEach(() => cleanup());

const fields: InputField[] = [
  { name: "now", type: "number", display: { title: "This hour" } },
  { name: "usual", type: "number", display: { title: "Usual" } },
];
const fieldsByName = new Map(fields.map((f) => [f.name, f]));

const card: Card = {
  name: "velocity",
  display: { title: "Velocity" },
  rows: [{ use: ["now", "usual"] }],
};

const empty: Decorations = { fields: new Map(), cards: new Map(), items: new Map() };

const withCardNote = (note: string): Decorations => ({
  ...empty,
  cards: new Map([["velocity", [{ rule: "surge", style: { tone: "warning", note } }]]]),
});

describe("CategoryCard", () => {
  it("states a card-level note once, not once per field", () => {
    render(
      <CategoryCard
        card={card}
        fieldsByName={fieldsByName}
        values={{ now: 40, usual: 10 }}
        decorations={withCardNote("Well above the usual rate.")}
        coercionErrors={new Map()}
      />,
    );
    expect(screen.getAllByText("Well above the usual rate.")).toHaveLength(1);
  });

  it("says nothing extra when no rule targeted the card", () => {
    render(
      <CategoryCard
        card={card}
        fieldsByName={fieldsByName}
        values={{ now: 11, usual: 10 }}
        decorations={empty}
        coercionErrors={new Map()}
      />,
    );
    expect(screen.getByText("Velocity")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

// The leaf can tint a chip and the rule produces the decorations; this is the
// wiring in between, which is where it was actually broken — `forEach` over a
// list of scalars fired, the decorations existed, and nothing reached the
// screen because the card path never handed them down.
describe("CategoryCard — a flagged entry in a list of scalars", () => {
  const listFields: InputField[] = [
    { name: "email", type: "text", display: { title: "Email" } },
    {
      name: "prev10",
      type: "array",
      items: { type: "text" },
      display: { title: "Previous 10" },
    },
  ];

  it("tints the matching entry and leaves the rest alone", () => {
    render(
      <CategoryCard
        card={{
          name: "identifiers",
          display: { title: "Identifiers" },
          rows: [{ use: ["email", "prev10"] }],
        }}
        fieldsByName={new Map(listFields.map((f) => [f.name, f]))}
        values={{ email: "new@acme.com", prev10: ["a@acme.com", "b@other.com"] }}
        decorations={{
          ...empty,
          items: new Map([
            [
              "prev10",
              [[{ rule: "same-domain", style: { tone: "warning", note: "Same domain." } }], []],
            ],
          ]),
        }}
        coercionErrors={new Map()}
      />,
    );
    expect(screen.getByText("a@acme.com").closest("[data-item]")?.className).toContain(
      "border-warning",
    );
    expect(screen.getByText("b@other.com").closest("[data-item]")?.className).not.toContain(
      "border-warning",
    );
  });
});
