import type { Condition } from "./config/schema";
import type { CoercedValue } from "./types/values";

/**
 * Evaluating a condition over a record's values.
 *
 * Deliberately separate from `decorations.ts`: a predicate is a general-purpose
 * thing, and keeping it here means a future feature that needs one — conditional
 * required-ness, show/hide — can reuse this evaluator instead of growing a
 * second condition language. What must never be reused is the *presentation*
 * side, which is why that lives in its own module.
 */

type Values = Readonly<Record<string, CoercedValue | undefined>>;

function isEmpty(value: CoercedValue | undefined): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Comparable form: Dates by instant, everything else by its primitive value. */
function comparable(value: CoercedValue | undefined): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** The right-hand side: a literal, or the value of another field. */
function rightOf(condition: Condition, values: Values): CoercedValue | undefined {
  if ("otherField" in condition && condition.otherField !== undefined) {
    return values[condition.otherField];
  }
  return "value" in condition ? (condition.value as CoercedValue | undefined) : undefined;
}

/** Ordered comparison, only meaningful for numbers and dates. */
function ordered(left: CoercedValue | undefined, right: unknown): number | undefined {
  const a = comparable(left);
  const b = typeof right === "object" && right instanceof Date ? right.getTime() : right;
  if (typeof a !== "number" || typeof b !== "number") return undefined;
  return a - b;
}

/**
 * Whether a condition holds for one record.
 *
 * Never throws: a rule pointed at a missing or wrongly-typed value simply does
 * not fire. A malformed rule should leave the data looking ordinary, not break
 * the screen the labeler is trying to read.
 */
export function evaluateCondition(condition: Condition, values: Values): boolean {
  const left = values[condition.field];

  switch (condition.op) {
    case "empty":
      return isEmpty(left);
    case "notEmpty":
      return !isEmpty(left);

    case "eq":
    case "ne": {
      const right = rightOf(condition, values);
      const same = comparable(left) === comparable(right);
      return condition.op === "eq" ? same : !same;
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const delta = ordered(left, rightOf(condition, values));
      if (delta === undefined) return false;
      if (condition.op === "gt") return delta > 0;
      if (condition.op === "gte") return delta >= 0;
      if (condition.op === "lt") return delta < 0;
      return delta <= 0;
    }

    case "in":
    case "notIn": {
      const needle = comparable(left);
      const found = condition.value.some((candidate) => comparable(candidate) === needle);
      return condition.op === "in" ? found : !found;
    }

    case "matches": {
      if (left === null || left === undefined) return false;
      try {
        return RegExp(condition.pattern).test(String(left));
      } catch {
        // The schema compiles patterns at load, so this is belt and braces.
        return false;
      }
    }
  }
}
