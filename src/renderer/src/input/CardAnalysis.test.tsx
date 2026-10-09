import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Card } from "@core/config";
import type { Decoration, Decorations } from "@core";
import { CardAnalysis } from "./CardAnalysis";

afterEach(() => cleanup());

const card: Card = {
  name: "identifiers",
  display: { title: "Email & Username" },
  rows: [{ use: ["email", "username", "prev10"] }],
};

const empty: Decorations = { fields: new Map(), cards: new Map(), items: new Map() };

const note = (text: string, over: Partial<Decoration> = {}): Decoration => ({
  rule: "r",
  style: { tone: "warning", note: text },
  ...over,
});

/** A list of `total` entries where the first `hit` carry `text`. */
const items = (hit: number, total: number, text: string): Decoration[][] =>
  Array.from({ length: total }, (_, i) => (i < hit ? [note(text)] : []));

const rules = () => screen.getByRole("heading", { name: /^Rules$/ }).parentElement!;
const model = () => screen.getByRole("heading", { name: /^Model$/ }).parentElement!;

describe("CardAnalysis", () => {
  // In a tool where the absence of a warning has to be trusted, "nothing found"
  // is a different message from an empty space, and only one is checkable.
  it("says nothing was found rather than rendering nothing, on both sides", () => {
    render(<CardAnalysis card={card} decorations={empty} />);
    expect(within(rules()).getByText("No rules fired.")).toBeInTheDocument();
    expect(within(model()).getByText("Nothing flagged.")).toBeInTheDocument();
  });

  it("lists a note about the card as a whole", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{
          ...empty,
          cards: new Map([["identifiers", [note("Handle matches address.")]]]),
        }}
      />,
    );
    expect(within(rules()).getByText(/Handle matches address./)).toBeInTheDocument();
    expect(within(rules()).queryByText("No rules fired.")).toBeNull();
    // The model column is untouched by an authored rule.
    expect(within(model()).getByText("Nothing flagged.")).toBeInTheDocument();
  });

  // Four of ten is a different observation from ten of ten, and the list alone
  // makes a reader count.
  it("collapses a per-item rule into one line with its tally", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{ ...empty, items: new Map([["prev10", items(4, 10, "Same domain.")]]) }}
      />,
    );
    expect(within(rules()).getByText(/Same domain./)).toBeInTheDocument();
    expect(within(rules()).getByText("(4 of 10)")).toBeInTheDocument();
  });

  it("does not repeat the note once per matching entry", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{ ...empty, items: new Map([["prev10", items(4, 10, "Same domain.")]]) }}
      />,
    );
    expect(within(rules()).getAllByText(/Same domain./)).toHaveLength(1);
  });

  // A per-item rule on a list shown by another card is that card's business.
  it("ignores a list this card does not show", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{ ...empty, items: new Map([["elsewhere", items(2, 5, "Not mine.")]]) }}
      />,
    );
    expect(within(rules()).getByText("No rules fired.")).toBeInTheDocument();
  });

  it("keeps an authored note and a model one apart", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{
          ...empty,
          cards: new Map([
            [
              "identifiers",
              [note("The author says so."), note("The model says so.", { source: "model" })],
            ],
          ]),
        }}
      />,
    );
    expect(screen.getByText(/Suggested by the local model/)).toBeInTheDocument();
    // The separation is structural now, not a shade of grey: a rule and a guess
    // cannot be read as one list because they are not in the same list.
    expect(within(rules()).getByText(/The author says so./)).toBeInTheDocument();
    expect(within(model()).getByText(/The model says so./)).toBeInTheDocument();
    expect(within(rules()).queryByText(/The model says so./)).toBeNull();
    expect(within(rules()).getByText(/The author says so./)).toBeInTheDocument();
  });
});
