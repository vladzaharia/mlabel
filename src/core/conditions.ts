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
function rightOf(condition: Condition, comparands: Values): CoercedValue | undefined {
  if ("otherField" in condition && condition.otherField !== undefined) {
    return comparands[condition.otherField];
  }
  return "value" in condition ? (condition.value as CoercedValue | undefined) : undefined;
}

/**
 * Split an address into its local part and domain.
 *
 * A value with **no `@` is all local part**, and that is not a nicety — it is
 * what makes `sameLocalPart` able to answer "is this username the sender?".
 * A bare handle compared against a full address has to have something to match.
 *
 * Split on the last `@` so a quoted local part containing one survives. No
 * plus-tag or dot stripping: that is Gmail's convention, not everyone's, and it
 * belongs in an author's own `matches` rule rather than baked in here.
 */
function emailParts(
  value: CoercedValue | undefined,
): { local: string; domain?: string } | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (s === "") return undefined;
  const at = s.lastIndexOf("@");
  if (at === -1) return { local: s.toLowerCase() };
  if (at === 0 || at === s.length - 1) return undefined;
  return { local: s.slice(0, at).toLowerCase(), domain: s.slice(at + 1).toLowerCase() };
}

/** A finite, non-negative magnitude, or undefined when the value is not one. */
function magnitude(value: CoercedValue | undefined): number | undefined {
  const n = comparable(value);
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return undefined;
  return n;
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
 *
 * `comparands` is where `otherField` is looked up, and defaults to `values` — so
 * an ordinary record-scoped rule reads one set of values, as it always has. The
 * two come apart only inside a `forEach` rule, where `field` names the element
 * under test and `otherField` names the record around it. Without that split a
 * list of signups could not be compared against the signup it belongs to: both
 * sides would resolve to the element and every row would match itself.
 */
export function evaluateCondition(
  condition: Condition,
  values: Values,
  comparands: Values = values,
): boolean {
  // Composition first: these carry no `field`, so nothing below applies to them.
  // The nested conditions see the same two scopes, which is what lets a
  // `forEach` rule combine a test on the element with a test on the record.
  switch (condition.op) {
    case "allOf":
      return condition.conditions.every((c) => evaluateCondition(c, values, comparands));
    case "anyOf":
      return condition.conditions.some((c) => evaluateCondition(c, values, comparands));
    case "not":
      return !evaluateCondition(condition.condition, values, comparands);
  }

  const left = values[condition.field];

  switch (condition.op) {
    case "empty":
      return isEmpty(left);
    case "notEmpty":
      return !isEmpty(left);

    case "eq":
    case "ne": {
      const right = rightOf(condition, comparands);
      const same = comparable(left) === comparable(right);
      return condition.op === "eq" ? same : !same;
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const delta = ordered(left, rightOf(condition, comparands));
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

    case "exceedsFactor":
    case "fallsBelowFactor": {
      const a = magnitude(left);
      const b = magnitude(comparands[condition.otherField]);
      // A ratio against zero or a negative baseline has no meaning, so the rule
      // stays quiet rather than firing on every record with an empty comparand.
      if (a === undefined || b === undefined || b === 0) return false;
      return condition.op === "exceedsFactor" ? a > b * condition.factor : a < b / condition.factor;
    }

    case "sameDomain": {
      const a = emailParts(left);
      const b = emailParts(comparands[condition.otherField]);
      if (a?.domain === undefined || b?.domain === undefined || a.domain !== b.domain) return false;
      // A domain both sides merely happen to use is not a shared domain. Two
      // accounts at gmail.com have nothing in common, and a rule that fires on
      // most rows of a file colours everything and says nothing.
      const ignored = condition.ignore?.some((domain) => domain.toLowerCase() === a.domain);
      return ignored !== true;
    }

    case "sameLocalPart": {
      const a = emailParts(left);
      const b = emailParts(comparands[condition.otherField]);
      return a !== undefined && b !== undefined && a.local === b.local;
    }

    case "sharesPrefix": {
      const a = left;
      const b = comparands[condition.otherField];
      if (typeof a !== "string" || typeof b !== "string") return false;
      const { length } = condition;
      // A value shorter than the prefix would otherwise match on a shorter
      // agreement than the author asked for.
      if (a.length < length || b.length < length) return false;
      return a.slice(0, length).toLowerCase() === b.slice(0, length).toLowerCase();
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
