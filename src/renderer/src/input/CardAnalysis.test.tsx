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

const section = () => screen.getByRole("heading", { name: /Analysis/ }).parentElement!;

describe("CardAnalysis", () => {
  // In a tool where the absence of a warning has to be trusted, "nothing found"
  // is a different message from an empty space, and only one is checkable.
  it("says nothing was found rather than rendering nothing", () => {
    render(<CardAnalysis card={card} decorations={empty} />);
    expect(screen.getByText("No anomalies detected.")).toBeInTheDocument();
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
    expect(within(section()).getByText(/Handle matches address./)).toBeInTheDocument();
    expect(screen.queryByText("No anomalies detected.")).toBeNull();
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
    expect(within(section()).getByText(/Same domain./)).toBeInTheDocument();
    expect(within(section()).getByText("(4 of 10)")).toBeInTheDocument();
  });

  it("does not repeat the note once per matching entry", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{ ...empty, items: new Map([["prev10", items(4, 10, "Same domain.")]]) }}
      />,
    );
    expect(within(section()).getAllByText(/Same domain./)).toHaveLength(1);
  });

  // A per-item rule on a list shown by another card is that card's business.
  it("ignores a list this card does not show", () => {
    render(
      <CardAnalysis
        card={card}
        decorations={{ ...empty, items: new Map([["elsewhere", items(2, 5, "Not mine.")]]) }}
      />,
    );
    expect(screen.getByText("No anomalies detected.")).toBeInTheDocument();
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
    expect(within(section()).getByText(/The author says so./)).toBeInTheDocument();
  });
});
