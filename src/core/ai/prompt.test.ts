import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import type { InputField } from "../config";
import { buildPrompt, prefixIsStable, recordBudget } from "./prompt";

const fields: InputField[] = [
  { name: "email", type: "text", display: { title: "Email" } },
  { name: "signups", type: "number" },
  { name: "at", type: "date" },
];

describe("buildPrompt", () => {
  it("describes the file's columns to the model", () => {
    const { prefix } = buildPrompt(fields, {});
    expect(prefix).toContain("email (text)");
    expect(prefix).toContain("signups (number)");
  });

  it("puts the record in the suffix, never the prefix", () => {
    const { prefix, suffix } = buildPrompt(fields, { email: "a@b.com" });
    expect(suffix).toContain("a@b.com");
    expect(prefix).not.toContain("a@b.com");
  });

  it("renders dates as an unambiguous instant", () => {
    const { suffix } = buildPrompt(fields, { at: new Date("2026-05-01T14:30:00Z") });
    expect(suffix).toContain("2026-05-01T14:30:00.000Z");
  });

  it("names an empty cell rather than leaving a blank", () => {
    // A bare `email:` reads as a formatting slip; the model should be told the
    // value is absent, because absence is itself sometimes the anomaly.
    expect(buildPrompt(fields, {}).suffix).toContain("email: (empty)");
  });

  it("keeps the whole record inside its budget, however large one cell is", () => {
    const { prefix, suffix } = buildPrompt(fields, { email: "x".repeat(50_000) });
    // The cap is on the record, not on each value: a single wide column may use
    // room its narrow neighbours do not need, and only the total has to hold.
    // Compared against the derived budget rather than a constant, so the two
    // cannot drift apart silently.
    expect(suffix.length).toBeLessThan(recordBudget(prefix) + 500);
    expect(suffix).toContain("…");
  });

  it("gives the record less room when the instructions take more", () => {
    // `ai.context` and the row compete for one window. A config that spends 2000
    // characters explaining itself has to leave less for the data.
    const roomy = recordBudget(buildPrompt(fields, {}).prefix);
    const cramped = recordBudget(buildPrompt(fields, {}, "c".repeat(2000)).prefix);
    expect(cramped).toBeLessThan(roomy);
    expect(roomy - cramped).toBeGreaterThanOrEqual(2000);
  });

  it("says when it shortened a value, so the model does not read it as damage", () => {
    // Without this the model reported the app's own truncation as a finding —
    // an ellipsis mid-address looks exactly like corrupt data.
    const { suffix } = buildPrompt(fields, { email: "x".repeat(50_000) });
    expect(suffix).toContain("shortened to fit");
    expect(suffix).toContain("50000 characters in full");
  });

  it("does not starve a narrow column to feed a wide one", () => {
    const { suffix } = buildPrompt(fields, {
      email: "x".repeat(50_000),
      signups: 42,
      at: new Date("2026-05-01T14:30:00Z"),
    });
    // The two small values are nowhere near any share of the budget, so they
    // must arrive whole no matter how greedy their neighbour is.
    expect(suffix).toContain("signups: 42");
    expect(suffix).toContain("at: 2026-05-01T14:30:00.000Z");
  });

  it("gives a wide column more than an equal share when its neighbours are small", () => {
    const solo = buildPrompt([fields[0]!], { email: "x".repeat(50_000) }).suffix;
    const withNeighbours = buildPrompt(fields, {
      email: "x".repeat(50_000),
      signups: 42,
      at: new Date("2026-05-01T14:30:00Z"),
    }).suffix;
    // An equal three-way split would give the email a third of the budget. It
    // should get very nearly all of it, because the others want almost none.
    expect(withNeighbours.length).toBeGreaterThan(solo.length * 0.9);
  });

  it("tells the model that saying nothing is the usual answer", () => {
    // Left to itself a small model will find something to say about every row,
    // which is worse than silence in a tool that anchors human judgement.
    expect(buildPrompt(fields, {}).prefix).toMatch(/empty list is the correct answer/i);
  });
});

// Column names and types say what the data *is*; only the author can say what
// it *means*. "These are signups reviewed for bulk registration" is the
// difference between a model guessing at the shape of a row and reading it for
// the thing being looked for.
describe("buildPrompt — the author's context", () => {
  it("carries the config's context into the prefix", () => {
    const { prefix } = buildPrompt(fields, {}, "Accounts reviewed for bulk registration.");
    expect(prefix).toContain("Accounts reviewed for bulk registration.");
  });

  it("omits the section entirely when the config gives none", () => {
    expect(buildPrompt(fields, {}).prefix).not.toMatch(/About this data/i);
  });

  it("ignores context that is only whitespace", () => {
    expect(buildPrompt(fields, {}, "   \n ").prefix).not.toMatch(/About this data/i);
  });

  // It belongs to the file, not the row, so it must not cost the KV cache.
  it("stays in the prefix, leaving the suffix untouched", () => {
    const withContext = buildPrompt(fields, { email: "a@b.com" }, "Context here.");
    const without = buildPrompt(fields, { email: "a@b.com" });
    expect(withContext.suffix).toBe(without.suffix);
    expect(withContext.prefix).not.toBe(without.prefix);
  });
});

describe("prompt prefix stability", () => {
  // The whole performance story rests on this: llama.cpp reuses the KV cache of
  // an unchanging prompt head, which is roughly 4s per record on a CPU-only
  // machine. Anything record-specific leaking into the prefix silently spends
  // that, so it is pinned rather than trusted.
  test.prop([
    fc.array(
      fc.record({
        email: fc.string(),
        signups: fc.integer(),
      }),
      { minLength: 2, maxLength: 10 },
    ),
  ])("is byte-identical across every record in a file", (records) => {
    const prompts = records.map((values) => buildPrompt(fields, values));
    expect(prefixIsStable(prompts)).toBe(true);
  });

  it("does change when the file's columns change", () => {
    const a = buildPrompt(fields, {});
    const b = buildPrompt([{ name: "other", type: "text" }], {});
    expect(a.prefix).not.toBe(b.prefix);
  });
});
