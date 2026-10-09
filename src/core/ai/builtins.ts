/**
 * The two questions this app asks of every record, whatever the config says.
 *
 * Both are deliberately domain-free. They ship with the app, so they cannot
 * assume anything about the data in front of them; anything that *can* be said
 * about a particular file belongs in `ai.questions`, written by the person who
 * knows what the file is.
 */

import type { TargetedQuestion } from "./question";

export const BUILT_IN_QUESTIONS: readonly TargetedQuestion[] = [
  {
    id: "anomalous",
    type: "boolean",
    ask: "Is anything in this record internally inconsistent, or obviously the wrong kind of thing for its column?",
    whenTrue: "something contradicts another value, or does not belong in its column",
    whenFalse: "the record hangs together",
  },
  {
    /**
     * The question the old free-text prompt could not express at all.
     *
     * "Wrong" and "unclear" are different findings with different remedies: a
     * wrong value gets corrected, an unclear one gets a guideline. A labeling
     * tool that only ever reports the first leaves the second to be rediscovered
     * by every labeler separately, and silently disagreed about in the output.
     */
    id: "ambiguous",
    type: "boolean",
    ask: "Could two careful people label this record differently from each other?",
    whenTrue: "a reasonable person could read it more than one way",
    whenFalse: "the right answer is clear",
  },
];

export const BUILT_IN_IDS: readonly string[] = BUILT_IN_QUESTIONS.map((question) => question.id);

export const isBuiltIn = (id: string): boolean => BUILT_IN_IDS.includes(id);

/**
 * Every question a config asks, in the order they are shown.
 *
 * One expression of "built-ins first, then the author's", because two callers
 * need it — the service that asks the questions and the renderer that matches
 * answers back to them — and a list that disagreed between them would show one
 * question's probability under another's heading.
 */
export const questionsOf = (
  config: {
    ai: { questions?: readonly TargetedQuestion[] };
  } | null,
): readonly TargetedQuestion[] =>
  config === null ? BUILT_IN_QUESTIONS : [...BUILT_IN_QUESTIONS, ...(config.ai.questions ?? [])];
