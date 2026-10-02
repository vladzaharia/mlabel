import type { Card } from "../config";
import type { Decoration, Decorations } from "../decorations";
import { noteFor } from "./note";
import type { TargetedQuestion } from "./question";
import { isWorthShowing, severityOf } from "./threshold";
import type { Analysis } from "./types";

/**
 * Putting model answers where the data is.
 *
 * An answer about a column belongs beside that column, not only in a panel at the
 * far side of the window — the labeler is looking at the value, and that is where
 * the remark about it should be. So answers travel through the same `Decorations`
 * channel display rules already use, and the renderer needs no second code path.
 *
 * **What must not happen is the two becoming indistinguishable.** A display rule
 * was written by someone who knows the data and fires deterministically; an
 * answer is a guess from a small model. Given identical treatment, a labeler
 * cannot tell authored intent from a guess — and this is a tool whose output
 * becomes somebody's ground truth. `Decoration.source` carries that difference,
 * and the renderer draws model notes differently.
 *
 * That separation matters *more* now than it did with prose. "This looks odd" is
 * self-evidently hedged; "91%" reads like a measurement, and a labeler is more
 * likely to defer to it. The number is better calibrated and more persuasive at
 * the same time, which is exactly when the visual distinction has to hold.
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
 * Answers as decorations.
 *
 * Only answers to questions that name something get placed: a record-level answer
 * has nowhere sensible to sit in the form, and would have to be duplicated onto
 * every field to appear at all. Those stay in the panel, which is exactly the
 * thing a panel is for.
 *
 * `questions` is how an answer finds its heading, since the answer carries only
 * an id. An answer whose question has vanished — a config reloaded while a cache
 * survived — is dropped rather than shown anonymously: a note a labeler cannot
 * trace back to a question is worse than no note.
 */
export function decorationsFromAnalysis(
  analysis: Analysis | undefined,
  questions: readonly TargetedQuestion[],
  layout: readonly Card[],
): Decorations {
  if (!analysis || analysis.answers.length === 0) return EMPTY;

  const byId = new Map(questions.map((question) => [question.id, question]));
  const cardOf = new Map<string, string>();
  for (const card of layout) {
    for (const row of card.rows) for (const name of row.use) cardOf.set(name, card.name);
  }

  const fields = new Map<string, Decoration[]>();
  const cards = new Map<string, Decoration[]>();
  const rule = `model:${analysis.modelId}`;

  for (const answer of analysis.answers) {
    const question = byId.get(answer.id);
    if (!question) continue;
    if (question.field === undefined && question.card === undefined) continue;
    if (!isWorthShowing(answer, question)) continue;

    const tone = severityOf(answer, question);
    const note = noteFor(question, answer);

    if (question.card !== undefined) {
      add(cards, question.card, { rule, source: "model", style: { tone, note } });
      continue;
    }

    const field = question.field;
    if (field === undefined) continue;

    // The value is marked, not annotated. A config may ask a dozen questions
    // about one column, and a dozen sentences stacked under a value is not
    // something a labeler can read while deciding something else — so the field
    // carries the tone, which says *look here*, and the words go to the card.
    add(fields, field, { rule, source: "model", style: { tone } });

    // Named, because a card gathers several fields and an unattributed line
    // reads as a statement about the card as a whole.
    const home = cardOf.get(field);
    if (home !== undefined) {
      add(cards, home, { rule, source: "model", style: { tone, note: `${field}: ${note}` } });
    }
  }

  return { fields, cards, items: EMPTY.items };
}

function join(
  left: ReadonlyMap<string, Decoration[]>,
  right: ReadonlyMap<string, Decoration[]>,
): Map<string, Decoration[]> {
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
}

/** Combine two decoration sets, keeping both sides' notes on a shared target. */
export function mergeDecorations(a: Decorations, b: Decorations): Decorations {
  return {
    fields: join(a.fields, b.fields),
    cards: join(a.cards, b.cards),
    // Per-item decorations come from `forEach` rules only; the model works a
    // record at a time and has no notion of a row inside a list.
    items: a.items,
  };
}
