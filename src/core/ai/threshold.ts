/**
 * Deciding whether an answer is worth a labeler's attention.
 *
 * The act/escalate split, and the only reason a calibrated probability is worth
 * more than a hedged sentence: below the threshold the app says nothing, rather
 * than saying something uncertain in a confident voice. A number beside a field
 * reads as *more* authoritative than prose, not less, so the bar for printing one
 * has to be explicit and it has to be the author's to move.
 */

import type { Answer } from "./answer";
import type { TargetedQuestion } from "./question";
import type { NoteSeverity } from "./types";

/**
 * Where "probably" starts.
 *
 * 0.7 rather than 0.5: at a coin flip the model is not telling anyone anything,
 * and a note beside a value is a claim on attention that a coin flip has not
 * earned. Authors can lower it per question where a cheap false positive is
 * worth catching a rare real one.
 */
export const DEFAULT_SHOW_ABOVE = 0.7;

/**
 * Whether to surface this answer.
 *
 * A `boolean` is measured on `p`, deliberately **not** on `confidence`. A `p` of
 * 0.02 is a *confident no*, and surfacing it would put a note on every clean
 * record — the same failure the old free-text prompt fought with the rule
 * "returning an empty list is the correct answer, and the common one". `choice`
 * and `score` always say something, so they are measured on how sure they are of
 * what they said.
 */
export function isWorthShowing(answer: Answer, question?: TargetedQuestion): boolean {
  const showAbove = question?.showAbove ?? DEFAULT_SHOW_ABOVE;

  if (answer.type === "boolean") return answer.p > showAbove;

  // Sure enough to be worth saying, *and* an answer worth saying at all. The two
  // are different tests: the model can be perfectly confident that this is an
  // ordinary gmail address, and that is precisely when to stay quiet.
  if (answer.confidence <= showAbove) return false;

  if (answer.type === "choice") {
    const notable = question?.type === "choice" ? question.notable : undefined;
    return notable === undefined || notable.includes(answer.chosen);
  }

  const from = question?.type === "score" ? question.notableFrom : undefined;
  return from === undefined || answer.score >= from;
}

/**
 * How strongly this answer leans, from 0 to 1.
 *
 * A `score` is measured by where it sits on its own scale rather than by
 * confidence, because the two say different things: "unmistakable, 60% sure" is
 * a louder finding than "weak signs, 99% sure", and reading the second as the
 * louder one would invert the scale the author wrote.
 */
export function strengthOf(answer: Answer, question?: TargetedQuestion): number {
  if (answer.type === "boolean") return answer.p;
  if (answer.type === "choice") return answer.confidence;

  const levels = question?.type === "score" ? question.levels.length : 0;
  return levels > 1 ? answer.score / (levels - 1) : answer.confidence;
}

/** At or above this, an answer is drawn as a warning. */
const LOUD = 0.9;
/** At or above this, an answer is drawn as info. Below it, muted. */
const NOTABLE = 0.75;

/**
 * How loudly to draw it.
 *
 * Graded, because a column of uniformly grey answers hides the only thing that
 * distinguishes them. Side by side, 97% and 62% in the same shade tell a
 * reviewer that the model found seven equal things, when it found one it is
 * nearly certain of and several it is guessing at. Calibration is the whole
 * point of this model class and flattening it away wastes it.
 *
 * Safe to colour now only because authored rules and model answers sit in
 * separate columns: the structural split carries "this is a guess", so the
 * colour is free to carry "and this is how strong". `toneOf` still prefers an
 * authored tone on a shared field, so a guess cannot recolour something the
 * config author already styled.
 *
 * `danger` stays unreachable, for the reason `types.ts` gives: in this app it
 * means *you must fix this*, and nothing a small model says earns that colour.
 */
export function severityOf(answer: Answer, question?: TargetedQuestion): NoteSeverity | "muted" {
  const strength = strengthOf(answer, question);
  if (strength >= LOUD) return "warning";
  if (strength >= NOTABLE) return "info";
  return "muted";
}
