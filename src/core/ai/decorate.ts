import type { Decoration, Decorations } from "../decorations";
import type { Analysis } from "./types";

/**
 * Putting model findings where the data is.
 *
 * A finding that names a column belongs beside that column, not only in a panel
 * at the far side of the window — the labeler is looking at the value, and that
 * is where the remark about it should be. So findings travel through the same
 * `Decorations` channel display rules already use, and the renderer needs no
 * second code path.
 *
 * **What must not happen is the two becoming indistinguishable.** A display rule
 * was written by someone who knows the data and fires deterministically; a
 * finding is a guess from a small model, right perhaps four times in five. Given
 * identical treatment, a labeler cannot tell authored intent from a guess — and
 * this is a tool whose output becomes somebody's ground truth. `Decoration.source`
 * carries that difference, and the renderer draws model notes differently.
 *
 * Like `decorations.ts`, nothing on the export path may import this.
 */

const EMPTY: Decorations = { fields: new Map(), cards: new Map(), items: new Map() };

function add(map: Map<string, Decoration[]>, key: string, decoration: Decoration): void {
  const existing = map.get(key);
  if (existing) existing.push(decoration);
  else map.set(key, [decoration]);
}

/**
 * Findings as decorations.
 *
 * Only findings that name something get placed: an unscoped remark about the row
 * as a whole has nowhere sensible to sit in the form, and would have to be
 * duplicated onto every field to appear at all. Those stay in the panel, which
 * is exactly the thing a panel is for.
 */
export function decorationsFromAnalysis(analysis: Analysis | undefined): Decorations {
  if (!analysis || analysis.findings.length === 0) return EMPTY;

  const fields = new Map<string, Decoration[]>();
  const cards = new Map<string, Decoration[]>();

  for (const finding of analysis.findings) {
    const decoration: Decoration = {
      rule: `model:${analysis.modelId}`,
      source: "model",
      style: { tone: finding.severity === "warning" ? "warning" : "info", note: finding.reason },
    };
    if (finding.field !== undefined) add(fields, finding.field, decoration);
    if (finding.card !== undefined) add(cards, finding.card, decoration);
  }

  return { fields, cards, items: EMPTY.items };
}

/** Combine two decoration sets, keeping both sides' notes on a shared target. */
export function mergeDecorations(a: Decorations, b: Decorations): Decorations {
  const join = (
    left: ReadonlyMap<string, Decoration[]>,
    right: ReadonlyMap<string, Decoration[]>,
  ): Map<string, Decoration[]> => {
    const out = new Map<string, Decoration[]>();
    for (const [key, values] of left) out.set(key, [...values]);
    for (const [key, values] of right) {
      const existing = out.get(key);
      // Authored notes read first, the model's after. Colour does not follow
      // order: `toneOf` prefers an authored tone outright, so a guess cannot
      // recolour a field the author had already styled.
      if (existing) existing.push(...values);
      else out.set(key, [...values]);
    }
    return out;
  };

  return {
    fields: join(a.fields, b.fields),
    cards: join(a.cards, b.cards),
    // Per-item decorations come from `forEach` rules only; the model works a
    // record at a time and has no notion of a row inside a list.
    items: a.items,
  };
}
