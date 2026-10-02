/**
 * Turning a model's logits into a typed answer.
 *
 * The whole readout, and the whole reason this feature needs no patched runtime:
 * assign a single letter to each possible answer, restrict the next-token
 * distribution to those letters, divide by the model's fitted temperature,
 * renormalise. One forward pass, nothing generated, nothing parsed.
 *
 * **Single letters, not option names.** `refund` and `returns` can share a first
 * token; `A` and `B` cannot. Comparing the first tokens of multi-token names
 * would score two different options against the same evidence and still look
 * like it was working — the worst failure available here, because it is silent.
 *
 * Pure arithmetic on purpose: no model, no Electron, no I/O. The part that
 * decides what the app believes is tested as arithmetic.
 */

import type { Answer } from "./answer";
import { labelCount, type Question } from "./question";

/**
 * The answer labels, in order.
 *
 * Upper-case ASCII only. These are single tokens in every tokenizer this app
 * loads, which the engine asserts at load time rather than assuming — see
 * `assertSingleTokenLabels`.
 */
export const LETTERS: readonly string[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Ceiling on the answers to one question.
 *
 * 16 because the published calibration temperature is fitted for up to 16
 * options; past that a model wants its separate knockout temperature, and a
 * model read at the wrong temperature is *miscalibrated* rather than merely
 * slower — confidently wrong instead of honestly unsure. The config schema caps
 * `choice` here so that case cannot arise at runtime.
 */
export const MAX_LABELS = 16;

/** The letters this question's answers are labelled with. */
export function lettersFor(question: Question): string[] {
  return LETTERS.slice(0, labelCount(question));
}

/**
 * Softmax over the restricted logits, at the given temperature.
 *
 * Shifted by the maximum before exponentiating. Raw logits reach magnitudes
 * where `Math.exp` overflows to `Infinity` and every probability becomes `NaN`;
 * the shift is cancelled exactly by the normalisation, so it changes the
 * arithmetic's range and not its result.
 */
export function softmaxOver(logits: readonly number[], temperature: number): number[] {
  const scaled = logits.map((logit) => logit / temperature);
  const max = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - max));
  const total = exps.reduce((a: number, b: number) => a + b, 0);
  return exps.map((value) => value / total);
}

/**
 * The typed answer for one question.
 *
 * `logits` are the label logits in label order. Anything past the question's
 * label count is ignored rather than trusted: the caller reads a distribution
 * over a whole vocabulary, so a longer slice means the extra entries were never
 * candidates and must not dilute the ones that were.
 */
export function readAnswer(
  question: Question,
  logits: readonly number[],
  temperature: number,
): Answer {
  const p = softmaxOver(logits.slice(0, labelCount(question)), temperature);

  switch (question.type) {
    case "boolean": {
      // A is true, B is false — fixed here and stated in the rendered question,
      // so the mapping is never inferred from the model's choice of words.
      const pTrue = p[0] ?? 0;
      return {
        id: question.id,
        type: "boolean",
        p: pTrue,
        // How sure it is *either way*. A 0.02 is a confident "no", and a
        // threshold needs to know that; `p` answers the question, `confidence`
        // says how firmly.
        confidence: Math.max(pTrue, 1 - pTrue),
      };
    }
    case "choice": {
      let best = 0;
      for (const [i, value] of p.entries()) if (value > (p[best] ?? 0)) best = i;
      const entries = question.options.map((option, i): [string, number] => [
        option.name,
        p[i] ?? 0,
      ]);
      return {
        id: question.id,
        type: "choice",
        chosen: question.options[best]?.name ?? "",
        p: new Map(entries),
        confidence: p[best] ?? 0,
      };
    }
    case "score": {
      // The probability-weighted mean, not the argmax: "mostly level 1 with some
      // level 2" is information the argmax discards, and it is what lets scores
      // be compared and sorted across records.
      const score = p.reduce((sum: number, value: number, i: number) => sum + i * value, 0);
      return { id: question.id, type: "score", score, p, confidence: Math.max(...p) };
    }
  }
}
