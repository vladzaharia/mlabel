/**
 * The bridge between a vocabulary distribution and the label logits.
 *
 * Its own module because `worker.ts` imports `node-llama-cpp` and therefore
 * cannot be unit-tested at all — a test that loads it would fork a native
 * runtime. Everything here is arithmetic over plain maps, so the two parts of
 * the readout that are easy to get wrong can be checked without a model.
 */

/**
 * Logit for a label the model gave no probability to.
 *
 * `Math.log(0)` is `-Infinity`, which makes the softmax `NaN` and surfaces as
 * "NaN%" beside a field. This floors it instead: the label still ranks last by a
 * wide margin, and the arithmetic downstream stays finite.
 */
export const UNSEEN_LOGIT = Math.log(Number.EPSILON);

/**
 * Label logits in label order, from a next-token probability distribution.
 *
 * `controlledEvaluate` hands back probabilities and `readAnswer` wants logits, so
 * this takes the log. Order comes from `labelTokens`, never from the map: the map
 * arrives sorted by probability, so iterating it would quietly permute the
 * answers and report the wrong option as chosen.
 */
export function labelLogits(
  probabilities: ReadonlyMap<number, number>,
  labelTokens: readonly number[],
): number[] {
  return labelTokens.map((token) => {
    const p = probabilities.get(token);
    return p === undefined || p <= 0 ? UNSEEN_LOGIT : Math.log(p);
  });
}

/**
 * Fail loudly if an answer label is not a single token in this vocabulary.
 *
 * A multi-token label does not throw at read time — it scores whatever its first
 * token happens to be and carries on, so every record comes back confidently
 * wrong with nothing in the logs. Checked once at load, where it is a startup
 * failure a person can act on.
 */
export function assertSingleTokenLabels(
  labels: readonly string[],
  tokenize: (text: string) => readonly number[],
): number[] {
  return labels.map((label) => {
    const tokens = tokenize(label);
    if (tokens.length !== 1) {
      throw new Error(
        `Answer label "${label}" is ${String(tokens.length)} tokens in this model's vocabulary; it must be exactly one.`,
      );
    }
    return tokens[0]!;
  });
}
