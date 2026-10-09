import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { evaluateCondition } from "./conditions";
import type { Condition } from "./config/schema";
import type { CoercedValue } from "./types/values";

type Values = Record<string, CoercedValue | undefined>;

const holds = (condition: Condition, values: Values): boolean =>
  evaluateCondition(condition, values);

describe("evaluateCondition", () => {
  it("compares against a literal", () => {
    expect(holds({ op: "eq", field: "a", value: "x" }, { a: "x" })).toBe(true);
    expect(holds({ op: "eq", field: "a", value: "x" }, { a: "y" })).toBe(false);
    expect(holds({ op: "ne", field: "a", value: "x" }, { a: "y" })).toBe(true);
  });

  it("compares one field against another", () => {
    const mismatch: Condition = { op: "ne", field: "expected", otherField: "actual" };
    expect(holds(mismatch, { expected: "a", actual: "b" })).toBe(true);
    expect(holds(mismatch, { expected: "a", actual: "a" })).toBe(false);
  });

  it("orders numbers", () => {
    expect(holds({ op: "gt", field: "s", value: 0.9 }, { s: 0.95 })).toBe(true);
    expect(holds({ op: "gt", field: "s", value: 0.9 }, { s: 0.5 })).toBe(false);
    expect(holds({ op: "lte", field: "s", value: 0.9 }, { s: 0.9 })).toBe(true);
  });

  it("orders dates by instant", () => {
    const cond: Condition = { op: "gt", field: "d", otherField: "e" };
    expect(holds(cond, { d: new Date("2026-02-01"), e: new Date("2026-01-01") })).toBe(true);
    expect(holds(cond, { d: new Date("2026-01-01"), e: new Date("2026-02-01") })).toBe(false);
  });

  // An ordered comparison over text has no defined meaning, so it simply does
  // not fire rather than guessing.
  it("does not fire an ordered comparison over text", () => {
    expect(holds({ op: "gt", field: "a", value: 1 }, { a: "banana" })).toBe(false);
  });

  it("tests membership", () => {
    expect(holds({ op: "in", field: "m", value: ["gpt-4", "claude"] }, { m: "claude" })).toBe(true);
    expect(holds({ op: "notIn", field: "m", value: ["gpt-4"] }, { m: "claude" })).toBe(true);
  });

  it("matches a regex against the stringified value", () => {
    const canned: Condition = { op: "matches", field: "r", pattern: "^(I'm sorry|As an AI)" };
    expect(holds(canned, { r: "I'm sorry, I can't help." })).toBe(true);
    expect(holds(canned, { r: "Sure, here's how." })).toBe(false);
    expect(holds(canned, { r: null })).toBe(false);
  });

  it("treats null, empty string and empty array as empty", () => {
    const empty: Condition = { op: "empty", field: "v" };
    expect(holds(empty, { v: null })).toBe(true);
    expect(holds(empty, { v: "" })).toBe(true);
    expect(holds(empty, { v: [] })).toBe(true);
    expect(holds(empty, { v: "x" })).toBe(false);
    expect(holds({ op: "notEmpty", field: "v" }, { v: "x" })).toBe(true);
  });

  // A rule aimed at a field that isn't there must leave the screen looking
  // ordinary rather than breaking the record the labeler is reading.
  it("never fires on a missing field", () => {
    expect(holds({ op: "eq", field: "nope", value: "x" }, {})).toBe(false);
    expect(holds({ op: "gt", field: "nope", value: 1 }, {})).toBe(false);
    expect(holds({ op: "matches", field: "nope", pattern: "x" }, {})).toBe(false);
  });
});

const exceeds = (factor: number): Condition => ({
  op: "exceedsFactor",
  field: "now",
  otherField: "usual",
  factor,
});
const falls = (factor: number): Condition => ({
  op: "fallsBelowFactor",
  field: "now",
  otherField: "usual",
  factor,
});

describe("evaluateCondition — magnitude", () => {
  it("fires only past the multiple, not merely above the comparand", () => {
    expect(holds(exceeds(3), { now: 31, usual: 10 })).toBe(true);
    expect(holds(exceeds(3), { now: 29, usual: 10 })).toBe(false);
    // The whole point: 11 is greater than 10, and that is not interesting.
    expect(holds(exceeds(3), { now: 11, usual: 10 })).toBe(false);
  });

  it("fires below a fraction of the comparand", () => {
    expect(holds(falls(3), { now: 3, usual: 10 })).toBe(true);
    expect(holds(falls(3), { now: 4, usual: 10 })).toBe(false);
  });

  it("degenerates to a plain comparison at a factor of one", () => {
    expect(holds(exceeds(1), { now: 11, usual: 10 })).toBe(true);
    expect(holds(falls(1), { now: 9, usual: 10 })).toBe(true);
    expect(holds(falls(1), { now: 11, usual: 10 })).toBe(false);
  });

  it("does not fire where a ratio has no meaning", () => {
    expect(holds(exceeds(3), { now: 31, usual: 0 })).toBe(false);
    expect(holds(exceeds(3), { now: 31, usual: -10 })).toBe(false);
    expect(holds(exceeds(3), { now: -31, usual: 10 })).toBe(false);
    expect(holds(exceeds(3), { now: "many", usual: 10 })).toBe(false);
    expect(holds(exceeds(3), { now: 31 })).toBe(false);
    expect(holds(exceeds(3), { now: null, usual: 10 })).toBe(false);
  });

  test.prop([
    fc.double({ min: 0, max: 1e6, noNaN: true }),
    fc.double({ min: Number.MIN_VALUE, max: 1e6, noNaN: true }),
    fc.double({ min: 1, max: 100, noNaN: true }),
  ])("is never both above and below the same magnitude", (now, usual, factor) => {
    const values = { now, usual };
    expect(holds(exceeds(factor), values) && holds(falls(factor), values)).toBe(false);
  });
});

describe("evaluateCondition — email shapes", () => {
  const sameDomain: Condition = { op: "sameDomain", field: "a", otherField: "b" };
  const sameLocal: Condition = { op: "sameLocalPart", field: "a", otherField: "b" };

  it("matches two addresses at the same domain", () => {
    expect(holds(sameDomain, { a: "x@acme.com", b: "y@acme.com" })).toBe(true);
    expect(holds(sameDomain, { a: "x@acme.com", b: "y@other.com" })).toBe(false);
  });

  it("ignores case on both sides", () => {
    expect(holds(sameDomain, { a: "X@ACME.COM", b: "y@acme.com" })).toBe(true);
    expect(holds(sameLocal, { a: "Vlad", b: "vlad@acme.com" })).toBe(true);
  });

  it("treats a value with no @ as all local part", () => {
    // This is the whole point of the operator: "is this username the sender?"
    // compares a bare handle against a full address.
    expect(holds(sameLocal, { a: "vlad", b: "vlad@acme.com" })).toBe(true);
    expect(holds(sameLocal, { a: "vlad", b: "someone@acme.com" })).toBe(false);
  });

  it("will not claim a bare username shares a domain", () => {
    expect(holds(sameDomain, { a: "vlad", b: "vlad@acme.com" })).toBe(false);
  });

  it("matches the same handle across different providers", () => {
    expect(holds(sameLocal, { a: "vlad@a.com", b: "vlad@b.com" })).toBe(true);
  });

  it("splits on the last @, so a quoted local part survives", () => {
    expect(holds(sameDomain, { a: "x@y@acme.com", b: "z@acme.com" })).toBe(true);
  });

  it("does not fire on empty, missing or non-string values", () => {
    expect(holds(sameDomain, { a: "", b: "y@acme.com" })).toBe(false);
    expect(holds(sameDomain, { a: null, b: "y@acme.com" })).toBe(false);
    expect(holds(sameLocal, { a: 42, b: "y@acme.com" })).toBe(false);
    expect(holds(sameDomain, { a: "x@acme.com" })).toBe(false);
    expect(holds(sameDomain, { a: "@acme.com", b: "y@acme.com" })).toBe(false);
    expect(holds(sameDomain, { a: "x@", b: "y@acme.com" })).toBe(false);
  });

  it("leaves plus-addressing alone", () => {
    // Gmail-specific normalisation is a `matches` rule in the author's config,
    // not something baked into the operator for every provider.
    expect(holds(sameLocal, { a: "vlad+tag@acme.com", b: "vlad@acme.com" })).toBe(false);
  });
});

// Two accounts sharing gmail.com share nothing. Without a way to say so, the
// rule fires on most rows in a file and the colour stops carrying information —
// and the alternative, a second rule that quietly overrides the tone, marks
// every free-provider address whether or not it matched anything.
describe("evaluateCondition — sameDomain with an ignore list", () => {
  const rule: Condition = {
    op: "sameDomain",
    field: "a",
    otherField: "b",
    ignore: ["gmail.com", "Hotmail.com"],
  };

  it("does not fire on a domain both sides merely happen to use", () => {
    expect(holds(rule, { a: "x@gmail.com", b: "y@gmail.com" })).toBe(false);
  });

  it("still fires on a domain that is not ignored", () => {
    expect(holds(rule, { a: "x@acme.com", b: "y@acme.com" })).toBe(true);
  });

  it("matches the ignore list case-insensitively", () => {
    expect(holds(rule, { a: "x@GMAIL.COM", b: "y@gmail.com" })).toBe(false);
    expect(holds(rule, { a: "x@hotmail.com", b: "y@hotmail.com" })).toBe(false);
  });

  it("behaves as before with no list", () => {
    const plain: Condition = { op: "sameDomain", field: "a", otherField: "b" };
    expect(holds(plain, { a: "x@gmail.com", b: "y@gmail.com" })).toBe(true);
  });
});

// Measured against 750 hand-labelled accounts, neither half of this pair is
// close to the conjunction: a non-free mail domain alone runs 92% bot, a handle
// matching the address local part alone 92%, and the two together 98%. Without
// composition an author has to emit both as separate rules and leave the reader
// to notice they coincided.
describe("evaluateCondition — composition", () => {
  const free: Condition = { op: "matches", field: "email", pattern: "@(gmail|yahoo)\\." };
  const sameLocal: Condition = { op: "sameLocalPart", field: "username", otherField: "email" };

  it("allOf holds only when every branch does", () => {
    const rule: Condition = {
      op: "allOf",
      conditions: [{ op: "not", condition: free }, sameLocal],
    };
    expect(holds(rule, { email: "vlad@acme.com", username: "vlad" })).toBe(true);
    expect(holds(rule, { email: "vlad@gmail.com", username: "vlad" })).toBe(false);
    expect(holds(rule, { email: "someone@acme.com", username: "vlad" })).toBe(false);
  });

  it("anyOf holds when one branch does", () => {
    const rule: Condition = { op: "anyOf", conditions: [free, sameLocal] };
    expect(holds(rule, { email: "vlad@gmail.com", username: "other" })).toBe(true);
    expect(holds(rule, { email: "vlad@acme.com", username: "vlad" })).toBe(true);
    expect(holds(rule, { email: "someone@acme.com", username: "other" })).toBe(false);
  });

  it("not inverts", () => {
    expect(holds({ op: "not", condition: free }, { email: "vlad@acme.com" })).toBe(true);
    expect(holds({ op: "not", condition: free }, { email: "vlad@gmail.com" })).toBe(false);
  });

  it("nests to any depth", () => {
    const rule: Condition = {
      op: "allOf",
      conditions: [
        {
          op: "not",
          condition: { op: "anyOf", conditions: [free, { op: "empty", field: "email" }] },
        },
        sameLocal,
      ],
    };
    expect(holds(rule, { email: "vlad@acme.com", username: "vlad" })).toBe(true);
    expect(holds(rule, { email: "", username: "" })).toBe(false);
  });

  // A missing value makes a leaf false, never an error — and `not` therefore
  // turns a missing value into a match, which is the honest reading of "this
  // address is not at a free provider" for a row with no address.
  it("stays total over missing values", () => {
    expect(holds({ op: "allOf", conditions: [free] }, {})).toBe(false);
    expect(holds({ op: "not", condition: free }, {})).toBe(true);
  });
});

// A neighbour having a machine-shaped handle says nothing about this account —
// that is the neighbour's problem. A neighbour whose handle starts with the
// same characters as this one is evidence the two were minted together, which
// is the question the column exists to answer.
describe("evaluateCondition — sharesPrefix", () => {
  const rule: Condition = { op: "sharesPrefix", field: "a", otherField: "b", length: 3 };

  it("fires when the leading characters match", () => {
    expect(holds(rule, { a: "BvdMugLier", b: "BvdHubsZing" })).toBe(true);
  });

  it("does not fire when they diverge inside the prefix", () => {
    expect(holds(rule, { a: "TotLeaTee", b: "BvdHubsZing" })).toBe(false);
  });

  it("ignores case", () => {
    expect(holds(rule, { a: "bvdmuglier", b: "BvdHubsZing" })).toBe(true);
  });

  // Otherwise "ab" and "abcdef" would match a 3-character rule on a 2-character
  // value, which is a shorter agreement than the author asked for.
  it("does not fire when a value is shorter than the prefix", () => {
    expect(holds(rule, { a: "Bv", b: "BvdHubsZing" })).toBe(false);
  });

  it("does not fire on empty, missing or non-string values", () => {
    expect(holds(rule, { a: "", b: "BvdHubsZing" })).toBe(false);
    expect(holds(rule, { a: null, b: "BvdHubsZing" })).toBe(false);
    expect(holds(rule, { a: "BvdMugLier" })).toBe(false);
    expect(holds(rule, { a: 42, b: "BvdHubsZing" })).toBe(false);
  });
});

describe("evaluateCondition — robustness", () => {
  const anyValue = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.constant(undefined),
  );

  test.prop([
    fc.constantFrom<Condition["op"]>("eq", "ne", "gt", "gte", "lt", "lte", "empty", "notEmpty"),
    anyValue,
    anyValue,
  ])("never throws, whatever the values are", (op, left, right) => {
    const condition = { op, field: "a", value: right } as Condition;
    expect(() => evaluateCondition(condition, { a: left as CoercedValue })).not.toThrow();
  });

  test.prop([
    fc.constantFrom<Condition["op"]>(
      "exceedsFactor",
      "fallsBelowFactor",
      "sameDomain",
      "sameLocalPart",
    ),
    anyValue,
    anyValue,
  ])("never throws for the relational operators either", (op, left, right) => {
    const condition = { op, field: "a", otherField: "b", factor: 2 } as Condition;
    expect(() =>
      evaluateCondition(condition, { a: left as CoercedValue, b: right as CoercedValue }),
    ).not.toThrow();
  });
});
