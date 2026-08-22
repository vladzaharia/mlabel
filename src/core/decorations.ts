import { evaluateCondition } from "./conditions";
import type { DisplayRule } from "./config/schema";
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

/** What a rule says about one field. */
export interface Decoration {
  /** The rule that produced it, for debugging and stable keys. */
  rule: string;
  style: Style;
}

/** Decorations by field name. Absent means "render normally". */
export type DecorationMap = ReadonlyMap<string, Decoration[]>;

const EMPTY: DecorationMap = new Map();

/**
 * Evaluate every rule against one record's values.
 *
 * Rules apply in declaration order, and a field may collect several — the
 * renderer decides how to combine them (last tone wins; every note is shown).
 */
export function evaluateDecorations(
  rules: readonly DisplayRule[] | undefined,
  values: Readonly<Record<string, CoercedValue | undefined>>,
): DecorationMap {
  if (!rules || rules.length === 0) return EMPTY;

  const out = new Map<string, Decoration[]>();
  for (const rule of rules) {
    if (!evaluateCondition(rule.when, values)) continue;
    // Defaults to the field the condition tests, which is what you want for a
    // single-field rule and never what you want for a mismatch between two.
    const targets = rule.appliesTo ?? [rule.when.field];
    for (const target of targets) {
      const existing = out.get(target);
      const decoration: Decoration = { rule: rule.name, style: rule.style };
      if (existing) existing.push(decoration);
      else out.set(target, [decoration]);
    }
  }
  return out;
}

/** The tone to render for a field: the last rule that set one wins. */
export function toneOf(decorations: readonly Decoration[] | undefined): Style["tone"] {
  if (!decorations) return undefined;
  for (let i = decorations.length - 1; i >= 0; i--) {
    const tone = decorations[i]?.style.tone;
    if (tone !== undefined) return tone;
  }
  return undefined;
}

/** Every explanation attached to a field, in rule order. */
export function notesOf(decorations: readonly Decoration[] | undefined): string[] {
  return (decorations ?? []).flatMap((d) => (d.style.note === undefined ? [] : [d.style.note]));
}
