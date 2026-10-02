import type { Condition } from "../config";

/**
 * What may be asked of a decision model, and where the answer belongs.
 *
 * A decision model does not write prose. The caller declares the valid answers
 * *before* the model runs and the model scores them, so a question here is not a
 * prompt fragment — it is a closed answer space. That is why `choice` carries its
 * options and `score` its levels rather than describing them inside `ask`: the
 * words in `ask` steer the model, but the options are what it is physically able
 * to answer.
 *
 * Nothing in this module — or anything that imports it — may be reachable from
 * the export path, for the reason `types.ts` gives.
 */

export interface ChoiceOption {
  name: string;
  /** What this option means, when the name alone is not enough. */
  means?: string;
}

export type Question =
  | {
      id: string;
      type: "boolean";
      ask: string;
      /** What a "yes" would mean, when `ask` leaves it open. */
      whenTrue?: string;
      whenFalse?: string;
    }
  | {
      id: string;
      type: "choice";
      ask: string;
      options: readonly ChoiceOption[];
      /**
       * The options worth telling the labeler about. Omit to surface all of them.
       *
       * Most choices have an unremarkable answer — "a major consumer mailbox" —
       * and marking a record with it is worse than saying nothing: it spends the
       * reviewer's attention to tell them nothing is wrong, and in a labeling
       * tool a reassuring mark anchors just as hard as an alarming one.
       */
      notable?: readonly string[];
    }
  | {
      id: string;
      type: "score";
      ask: string;
      /** Weakest first. The answer is a weighted average of these positions. */
      levels: readonly string[];
      /**
       * Only surface the answer once it reaches this level, by index.
       *
       * A scale almost always has a quiet end. "Nothing unusual" is the common
       * answer and the one nobody needs drawn to their attention.
       */
      notableFrom?: number;
    };

export type QuestionType = Question["type"];

export const QUESTION_TYPES = ["boolean", "choice", "score"] as const;

/**
 * Where an answer lands, and when to ask at all.
 *
 * Deliberately the same shape `Finding` used: optional `field`, optional `card`,
 * neither meaning the record as a whole. `Card` already spends the word `scope`
 * on `record | session`, so this does not reuse it and does not invent a third
 * way to name a column.
 */
export interface Target {
  field?: string;
  card?: string;
  /**
   * The short line shown when this answer crosses its threshold.
   *
   * Deliberately separate from `ask`. The question has to be long and
   * unambiguous because the model has no context; the note has to be short and
   * declarative because a labeler reads it while deciding something else. Using
   * one text for both gives the reviewer an interrogation with a number stapled
   * to it, next to authored rules that state a finding in six words.
   */
  note?: string;
  /**
   * Only ask when this holds.
   *
   * The same condition language display rules use, rather than a second one. A
   * question that cannot apply is never encoded, so this is also the cost lever.
   *
   * Imported as a type only — `config/schema.ts` imports `BUILT_IN_IDS` from the
   * other direction, and `import type` is erased, so the cycle exists for the
   * typechecker and never at runtime.
   */
  when?: Condition;
  /** Hide the answer unless the model is at least this sure. */
  showAbove?: number;
}

export type TargetedQuestion = Question & Target;

/** How many answer labels this question needs. */
export function labelCount(question: Question): number {
  switch (question.type) {
    case "boolean":
      return 2;
    case "choice":
      return question.options.length;
    case "score":
      return question.levels.length;
  }
}
