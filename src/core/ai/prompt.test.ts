import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import type { InputField } from "../config";
import { buildPrompt, prefixIsStable } from "./prompt";

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

  it("truncates one enormous cell so it cannot crowd out the rest", () => {
    const { suffix } = buildPrompt(fields, { email: "x".repeat(5000) });
    expect(suffix.length).toBeLessThan(1500);
    expect(suffix).toContain("…");
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
