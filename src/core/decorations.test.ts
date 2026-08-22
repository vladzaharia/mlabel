import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { evaluateCondition } from "./conditions";
import { evaluateDecorations, notesOf, toneOf } from "./decorations";
import type { Condition, DisplayRule } from "./config/schema";
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
});

describe("evaluateDecorations", () => {
  const rules: DisplayRule[] = [
    {
      name: "canned",
      when: { op: "matches", field: "response", pattern: "^Sorry" },
      appliesTo: ["response"],
      style: { tone: "muted", note: "Canned refusal." },
    },
    {
      name: "mismatch",
      when: { op: "ne", field: "expected", otherField: "actual" },
      appliesTo: ["expected", "actual"],
      style: { tone: "danger", note: "Expected ≠ actual." },
    },
    {
      name: "hot",
      when: { op: "gt", field: "score", value: 0.9 },
      style: { tone: "warning" },
    },
  ];

  it("is empty when no rule fires", () => {
    expect(evaluateDecorations(rules, { response: "Sure", expected: "a", actual: "a" }).size).toBe(
      0,
    );
  });

  it("paints every field a rule applies to, not just the one it tests", () => {
    const map = evaluateDecorations(rules, { expected: "a", actual: "b" });
    expect(toneOf(map.get("expected"))).toBe("danger");
    expect(toneOf(map.get("actual"))).toBe("danger");
  });

  it("defaults the target to the field the condition tests", () => {
    const map = evaluateDecorations(rules, { score: 0.95 });
    expect(toneOf(map.get("score"))).toBe("warning");
  });

  it("collects every note for a field", () => {
    const map = evaluateDecorations(rules, { response: "Sorry, no." });
    expect(notesOf(map.get("response"))).toEqual(["Canned refusal."]);
  });

  it("lets the last tone win when rules overlap", () => {
    const overlapping: DisplayRule[] = [
      { name: "a", when: { op: "notEmpty", field: "x" }, style: { tone: "info" } },
      { name: "b", when: { op: "notEmpty", field: "x" }, style: { tone: "danger" } },
    ];
    expect(toneOf(evaluateDecorations(overlapping, { x: "v" }).get("x"))).toBe("danger");
  });

  it("is a no-op when the config declares no rules", () => {
    expect(evaluateDecorations(undefined, { a: 1 }).size).toBe(0);
    expect(evaluateDecorations([], { a: 1 }).size).toBe(0);
  });

  it("does not mutate the values it reads", () => {
    const values = { expected: "a", actual: "b" };
    evaluateDecorations(rules, values);
    expect(values).toEqual({ expected: "a", actual: "b" });
  });
});
