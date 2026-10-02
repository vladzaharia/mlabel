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
export function isWorthShowing(answer: Answer, showAbove: number = DEFAULT_SHOW_ABOVE): boolean {
  return answer.type === "boolean" ? answer.p > showAbove : answer.confidence > showAbove;
}

/**
 * How loudly to draw it.
 *
 * `danger` stays unreachable, for the reason `types.ts` gives: in this app it
 * means *you must fix this*, and nothing a small model says earns that colour.
 * Borrowing it would make a guess look like a defect.
 */
export const severityOf = (answer: Answer): NoteSeverity =>
  answer.type === "boolean" ? "warning" : "info";
