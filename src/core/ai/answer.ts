/**
 * What a decision model gave back.
 *
 * Always a distribution, never a verdict. `confidence` is the probability of the
 * answer actually chosen, and it is the number a threshold is compared against —
 * the act/escalate split is the whole reason a calibrated probability is worth
 * more than a hedged sentence. A model that says 0.8 is right about four times in
 * five, so 0.8 can be acted on and 0.5 can be left alone; prose offers no such
 * handle, which is why the old path had to guess from the model's word choice.
 */

export interface BooleanAnswer {
  id: string;
  type: "boolean";
  /** Probability that the answer is true. */
  p: number;
  confidence: number;
}

export interface ChoiceAnswer {
  id: string;
  type: "choice";
  chosen: string;
  /** Every option's probability, in the order the question declared them. */
  p: ReadonlyMap<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  id: string;
  type: "score";
  /**
   * Probability-weighted mean of the level indices.
   *
   * So 1.15 is "mostly level 1, with some level 2" — information the argmax
   * throws away, and what makes scores sortable across records.
   */
  score: number;
  p: readonly number[];
  confidence: number;
}

export type Answer = BooleanAnswer | ChoiceAnswer | ScoreAnswer;

const pct = (p: number): string => `${Math.round(p * 100)}%`;

/** One short string for an answer, for the panel and the log. */
export function answerLabel(answer: Answer): string {
  switch (answer.type) {
    case "boolean":
      return pct(answer.p);
    case "choice":
      return `${answer.chosen} (${pct(answer.confidence)})`;
    case "score":
      return answer.score.toFixed(1);
  }
}
