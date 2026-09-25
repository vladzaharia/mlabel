import { evaluateCondition } from "./conditions";
import { conditionFields, type DisplayRule } from "./config/schema";
import type { Style } from "./config/value-type";
import type { CoercedValue } from "./types/values";

/**
 * Turning display rules into presentation intent.
 *
 * **Nothing on the export path may import this module.** That is the whole
 * guarantee: a rule can tint a value red and explain why, and it cannot change
 * one byte of what gets written. The predicate half lives in `conditions.ts`
 * precisely so a future feature needing a condition doesn't have to reach in
 * here and blur the line.
 *
 * A rule's tone reads as *the system is telling you something*, which is a
 * different thing from a validation error the labeler is expected to fix — they
 * cannot fix the source data. The renderer styles the two differently.
 */

/** Where a decoration came from. */
export type DecorationSource = "rule" | "model";

/** What a rule says about one field. */
export interface Decoration {
  /** The rule that produced it, for debugging and stable keys. */
  rule: string;
  /**
   * Defaults to `rule`. A `model` decoration is a guess from a small local
   * model rather than something a config author wrote, and the renderer draws
   * it differently so the two are never mistaken for each other.
   */
  source?: DecorationSource;
  style: Style;
}

/** Decorations by name. Absent means "render normally". */
export type DecorationMap = ReadonlyMap<string, Decoration[]>;

/**
 * Everything the rules had to say about one record.
 *
 * Three scopes rather than one map, because the names live in separate
 * namespaces: a card may legitimately share a name with a field, and a single
 * map could not tell the renderer which one a rule meant.
 */
export interface Decorations {
  /** By input field name. */
  fields: DecorationMap;
  /** By card name. A note here states once what would otherwise repeat. */
  cards: DecorationMap;
  /**
   * By list field name, then by element index.
   *
   * Dense and index-aligned with the rendered rows — empty where nothing fired —
   * so the renderer can index straight into it without tracking an offset.
   */
  items: ReadonlyMap<string, readonly (readonly Decoration[])[]>;
}

const EMPTY: DecorationMap = new Map();
const EMPTY_ITEMS: Decorations["items"] = new Map();

function add(map: Map<string, Decoration[]>, key: string, decoration: Decoration): void {
  const existing = map.get(key);
  if (existing) existing.push(decoration);
  else map.set(key, [decoration]);
}

/**
 * Evaluate every rule against one record's values.
 *
 * Rules apply in declaration order, and a target may collect several — the
 * renderer decides how to combine them (last tone wins; every note is shown).
 */
export function evaluateDecorations(
  rules: readonly DisplayRule[] | undefined,
  values: Readonly<Record<string, CoercedValue | undefined>>,
): Decorations {
  if (!rules || rules.length === 0) return { fields: EMPTY, cards: EMPTY, items: EMPTY_ITEMS };

  const fields = new Map<string, Decoration[]>();
  const cards = new Map<string, Decoration[]>();
  const items = new Map<string, Decoration[][]>();

  for (const rule of rules) {
    const decoration: Decoration = { rule: rule.name, style: rule.style };

    if (rule.forEach !== undefined) {
      decorateItems(rule, decoration, values, items);
      continue;
    }

    if (!evaluateCondition(rule.when, values)) continue;

    for (const name of rule.appliesToCards ?? []) add(cards, name, decoration);
    // Defaults to the field the condition tests, which is what you want for a
    // single-field rule and never what you want for a mismatch between two.
    // Skipped entirely once the rule names a target of its own — a rule aimed
    // at a card must not also quietly paint the field it happened to test.
    const explicit = rule.appliesTo ?? (rule.appliesToCards ? [] : conditionFields(rule.when));
    for (const name of explicit) add(fields, name, decoration);
  }
  return { fields, cards, items };
}

/**
 * Run one rule across the elements of a list.
 *
 * Two scopes, and which is which is the whole design:
 *
 * - **`field` reads the element**, falling back to the record for a name the
 *   element does not carry. An element's own fields therefore shadow record
 *   columns of the same name.
 * - **`otherField` always reads the record.**
 *
 * That split is what makes the construct able to express the question it exists
 * for — "does this row's email share a domain with the record's email" — where
 * both sides are spelled `email`. Merging the two scopes would resolve both to
 * the element, and every row would match itself.
 *
 * How an element is *named* depends on what it is:
 *
 * - An **object** contributes its own fields, as above.
 * - A **scalar** answers to the list's own name. A CSV cell holding ten
 *   comma-joined addresses coerces to an array of strings, not of objects, and
 *   that is the shape the per-item rules exist to serve; without this they
 *   would be unusable on exactly the data they were built for.
 *
 * The consequence, deliberately accepted: two *element* fields cannot be
 * compared against each other. A rule relating a row to its record is the case
 * worth having; relating a row to itself can be added when something needs it.
 *
 * The row array is allocated at the list's full length whatever happens, so an
 * element that is null or unreadable leaves a hole rather than shifting every
 * decoration after it onto the wrong row.
 */
function decorateItems(
  rule: DisplayRule,
  decoration: Decoration,
  values: Readonly<Record<string, CoercedValue | undefined>>,
  items: Map<string, Decoration[][]>,
): void {
  const name = rule.forEach as string;
  const list = values[name];
  if (!Array.isArray(list)) return;

  let rows = items.get(name);
  if (!rows) {
    rows = Array.from({ length: list.length }, () => []);
    items.set(name, rows);
  }

  list.forEach((item, i) => {
    if (item === null) return;

    if (typeof item === "object" && !Array.isArray(item)) {
      const scope = { ...values, ...(item as Record<string, CoercedValue>) };
      if (evaluateCondition(rule.when, scope, values)) rows[i]?.push(decoration);
      return;
    }

    // A scalar element answers to one name and one only. Evaluating a rule that
    // tests some *other* field would silently compare the record against
    // itself — `sameDomain` on `email` vs `email` is true for every element —
    // and paint the whole list. If the condition is not about the element, the
    // element is not what the rule is about.
    //
    // For a composing condition it is enough that *one* branch tests the list:
    // "neighbours sharing this domain, but only when the account's own address
    // looks machine-issued" is a legitimate thing to ask, and its second branch
    // is about the record by design.
    if (!conditionFields(rule.when).includes(name)) return;
    if (evaluateCondition(rule.when, { ...values, [name]: item as CoercedValue }, values)) {
      rows[i]?.push(decoration);
    }
  });
}

/**
 * The tone to render: the last rule that set one wins.
 *
 * Authored rules outrank the model. A config author knows the data and their
 * rule fires deterministically; a model finding is a guess, and letting it
 * recolour a field the author had already styled would overwrite a statement
 * with a suggestion. The model's note is still shown — only its colour yields.
 */
export function toneOf(decorations: readonly Decoration[] | undefined): Style["tone"] {
  if (!decorations) return undefined;
  const lastToneOf = (from: readonly Decoration[]): Style["tone"] => {
    for (let i = from.length - 1; i >= 0; i--) {
      const tone = from[i]?.style.tone;
      if (tone !== undefined) return tone;
    }
    return undefined;
  };
  return lastToneOf(decorations.filter((d) => d.source !== "model")) ?? lastToneOf(decorations);
}

/** Whether anything here came from the model rather than from a config rule. */
export const hasModelDecoration = (decorations: readonly Decoration[] | undefined): boolean =>
  (decorations ?? []).some((d) => d.source === "model");

/** Every explanation attached to a field, in rule order. */
export function notesOf(decorations: readonly Decoration[] | undefined): string[] {
  return (decorations ?? []).flatMap((d) => (d.style.note === undefined ? [] : [d.style.note]));
}
