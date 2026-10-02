/**
 * Turning an answer into the one line a labeler reads.
 *
 * The question sent to the model and the note shown to a person are different
 * texts with different jobs, and collapsing them was a mistake worth naming: a
 * question has to be long and unambiguous because the model has no context, and
 * a note has to be short and declarative because the labeler is reading it out of
 * the corner of their eye while deciding something else.
 *
 * Put side by side with an authored display rule — "Handle is the address, on an
 * uncommon mail domain." — a note that reads "Does the domain look registered in
 * bulk to send or receive signup mail, rather than belonging to a real business,
 * school, ISP or mail provider? 88%" is not a finding. It is an interrogation
 * with a number stapled to it.
 *
 * So `note` states what was found and the probability qualifies it, in that
 * order, because the finding is what the eye needs first.
 */

import type { Answer } from "./answer";
import type { TargetedQuestion } from "./question";

/** The level a score sits nearest, clamped to the ones that exist. */
function nearestLevel(levels: readonly string[], score: number): string {
  const index = Math.min(levels.length - 1, Math.max(0, Math.round(score)));
  return levels[index] ?? "";
}

/**
 * One short line for an answer that crossed its threshold.
 *
 * Falls back to the question text when a config supplies no `note`. That is worse
 * to read but never wrong, and it keeps `note` optional for a quick config.
 */
export function noteFor(question: TargetedQuestion, answer: Answer): string {
  const label = question.note ?? question.ask;

  switch (answer.type) {
    case "boolean":
      // The note already says what being true means, and the probability is
      // shown as its own column, so the statement is the whole line.
      return label;
    case "choice":
      return `${label}: ${answer.chosen}`;
    case "score":
      // The level names the finding; the raw score says where between levels it
      // fell, which is the part that makes scores comparable across records and
      // is not recoverable from the strength bar alone.
      return `${label}: ${nearestLevel(question.type === "score" ? question.levels : [], answer.score)} (${answer.score.toFixed(1)})`;
  }
}
