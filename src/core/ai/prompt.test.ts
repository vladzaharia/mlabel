import { describe, expect, it } from "vitest";
import type { InputField } from "../config";
import {
  buildPrefix,
  buildPrompt,
  buildSuffix,
  MAX_SUFFIX_CHARS,
  prefixIsStable,
  renderQuestion,
  windowAround,
  type RenderedRecord,
} from "./prompt";

const fields = [
  { name: "name", type: "text" },
  { name: "age", type: "integer" },
] as unknown as InputField[];

describe("windowAround", () => {
  it("clamps at the start of the file", () => {
    expect(windowAround(0, 10, { before: 2, after: 2 })).toEqual([0, 1, 2]);
  });

  it("clamps at the end of the file", () => {
    expect(windowAround(9, 10, { before: 2, after: 2 })).toEqual([7, 8, 9]);
  });

  it("is just the record when the window is zero", () => {
    expect(windowAround(5, 10, { before: 0, after: 0 })).toEqual([5]);
  });

  it("never emits an index outside the file, and always includes the record", () => {
    for (let count = 1; count < 8; count++) {
      for (let i = 0; i < count; i++) {
        const window = windowAround(i, count, { before: 3, after: 3 });
        expect(window.every((n) => n >= 0 && n < count)).toBe(true);
        expect(window).toContain(i);
        expect(new Set(window).size).toBe(window.length);
        expect([...window].toSorted((a, b) => a - b)).toEqual(window);
      }
    }
  });
});

describe("renderQuestion", () => {
  it("labels choice options with letters in declared order", () => {
    const rendered = renderQuestion({
      id: "intent",
      type: "choice",
      ask: "What do they want?",
      options: [{ name: "refund", means: "money back" }, { name: "track" }],
    });
    expect(rendered).toContain("A. refund — money back");
    expect(rendered).toContain("B. track");
    expect(rendered).toContain("What do they want?");
  });

  it("maps a boolean to A for yes and B for no, stated rather than implied", () => {
    // The readout hard-codes A as true. If the rendered question ever disagreed,
    // every boolean would come back inverted and nothing would error.
    const rendered = renderQuestion({ id: "q", type: "boolean", ask: "Is it odd?" });
    expect(rendered).toContain("A. yes");
    expect(rendered).toContain("B. no");
  });

  it("carries a boolean's criteria onto its labels when given", () => {
    const rendered = renderQuestion({
      id: "q",
      type: "boolean",
      ask: "Is it odd?",
      whenTrue: "something contradicts",
      whenFalse: "it hangs together",
    });
    expect(rendered).toContain("A. yes — something contradicts");
    expect(rendered).toContain("B. no — it hangs together");
  });

  it("labels score levels weakest first", () => {
    const rendered = renderQuestion({
      id: "q",
      type: "score",
      ask: "How bad?",
      levels: ["fine", "bad", "worse"],
    });
    expect(rendered.indexOf("A. fine")).toBeLessThan(rendered.indexOf("C. worse"));
  });

  it("ends by asking for a single letter and nothing else", () => {
    expect(renderQuestion({ id: "q", type: "boolean", ask: "?" })).toMatch(/single letter/i);
  });
});

describe("buildSuffix", () => {
  const current: RenderedRecord = { values: { name: "Ada", age: 36 }, current: true };
  const neighbour = (name: string): RenderedRecord => ({ values: { name, age: 20 } });

  it("marks which record is under review when neighbours are present", () => {
    const suffix = buildSuffix(fields, [neighbour("Bob"), current, neighbour("Cy")]);
    expect(suffix).toContain("Ada");
    expect(suffix).toContain("Bob");
    expect(suffix).toContain("Cy");
    expect(suffix.toLowerCase()).toContain("under review");
  });

  it("shows only the record when there are no neighbours", () => {
    const suffix = buildSuffix(fields, [current]);
    expect(suffix).toContain("Ada");
    expect(suffix).not.toContain("Nearby");
  });

  it("renders an empty value as something the model can read", () => {
    const suffix = buildSuffix(fields, [{ values: { name: "", age: undefined }, current: true }]);
    expect(suffix).toContain("(empty)");
  });

  it("drops the farthest neighbours first when the budget is tight", () => {
    // The record under review must survive any budget; a suffix that dropped it
    // would ask the model about nothing at all.
    const fat = (name: string): RenderedRecord => ({
      values: { name: name.repeat(2000), age: 1 },
    });
    const suffix = buildSuffix(fields, [fat("far"), fat("near"), current, fat("after")]);
    expect(suffix).toContain("Ada");
    expect(suffix.length).toBeLessThanOrEqual(MAX_SUFFIX_CHARS);
  });

  it("keeps the record under review even when it alone exceeds the budget", () => {
    const huge: RenderedRecord = { values: { name: "x".repeat(50_000), age: 1 }, current: true };
    const suffix = buildSuffix(fields, [neighbour("Bob"), huge]);
    expect(suffix.toLowerCase()).toContain("under review");
  });

  it("caps one enormous cell rather than letting it crowd out the row", () => {
    const suffix = buildSuffix(fields, [
      { values: { name: "z".repeat(1000), age: 1 }, current: true },
    ]);
    expect(suffix).toContain("…");
    expect(suffix).toContain("age: 1");
  });
});

describe("buildPrefix", () => {
  it("does not vary with the record", () => {
    expect(buildPrefix(fields, "ctx")).toBe(buildPrefix(fields, "ctx"));

    // Two different records must still share one prefix — that shared head is
    // what llama.cpp's KV cache reuses, and the whole per-record cost depends on
    // it staying identical.
    const one = buildPrompt(fields, [{ values: { name: "Ada", age: 36 }, current: true }]);
    const two = buildPrompt(fields, [{ values: { name: "Bob", age: 20 }, current: true }]);
    expect(prefixIsStable([one, two])).toBe(true);
    expect(one.suffix).not.toBe(two.suffix);
  });

  it("names every column and its type", () => {
    const prefix = buildPrefix(fields);
    expect(prefix).toContain("name (text)");
    expect(prefix).toContain("age (integer)");
  });

  it("includes the author's context when there is some", () => {
    expect(buildPrefix(fields, "Billing tickets.")).toContain("Billing tickets.");
  });

  it("omits the context section entirely when there is none", () => {
    expect(buildPrefix(fields)).not.toContain("About this data");
    expect(buildPrefix(fields, "   ")).not.toContain("About this data");
  });
});
