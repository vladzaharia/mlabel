import { array, assert, double, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { lettersFor, readAnswer, softmaxOver } from "./letters";
import type { Question } from "./question";

const choice: Question = {
  id: "intent",
  type: "choice",
  ask: "?",
  options: [{ name: "refund" }, { name: "track" }, { name: "other" }],
};

describe("lettersFor", () => {
  it("assigns A, B, C in option order", () => {
    expect(lettersFor(choice)).toEqual(["A", "B", "C"]);
  });

  it("gives a boolean exactly two letters", () => {
    expect(lettersFor({ id: "q", type: "boolean", ask: "?" })).toEqual(["A", "B"]);
  });

  it("never repeats a letter", () => {
    const letters = lettersFor({ id: "q", type: "score", ask: "?", levels: ["a", "b", "c", "d"] });
    expect(new Set(letters).size).toBe(letters.length);
  });
});

describe("softmaxOver", () => {
  it("sums to one", () => {
    const p = softmaxOver([2, 1, 0], 1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("is invariant to a constant logit shift", () => {
    const a = softmaxOver([2, 1, 0], 1);
    const b = softmaxOver([12, 11, 10], 1);
    for (const [i, value] of a.entries()) expect(value).toBeCloseTo(b[i]!, 10);
  });

  it("softens the distribution as temperature rises", () => {
    const cold = Math.max(...softmaxOver([4, 1, 0], 1));
    const warm = Math.max(...softmaxOver([4, 1, 0], 2));
    expect(warm).toBeLessThan(cold);
  });

  it("survives logits large enough to overflow a naive exp", () => {
    // Raw logits reach magnitudes where `Math.exp` is `Infinity`, which would
    // make every probability `NaN`. The max-shift is what keeps this finite.
    const p = softmaxOver([900, 800], 1);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p[0]).toBeCloseTo(1, 10);
  });

  it("sums to one for any finite logits and positive temperature", () => {
    assert(
      property(
        array(double({ min: -50, max: 50, noNaN: true }), { minLength: 2, maxLength: 16 }),
        double({ min: 0.1, max: 5, noNaN: true }),
        (logits, temperature) => {
          const total = softmaxOver(logits, temperature).reduce((a, b) => a + b, 0);
          expect(total).toBeCloseTo(1, 8);
        },
      ),
    );
  });
});

describe("readAnswer", () => {
  it("reads a boolean as the probability of the true label", () => {
    const answer = readAnswer({ id: "q", type: "boolean", ask: "?" }, [1, 0], 1);
    if (answer.type !== "boolean") throw new Error("unreachable");
    expect(answer.p).toBeCloseTo(Math.exp(1) / (Math.exp(1) + Math.exp(0)), 10);
  });

  it("reports confidence as how sure it is either way, not as the true probability", () => {
    // A 0.02 "true" is a *confident no*. Confidence is about the answer given,
    // which is what a threshold needs; `p` is about the question asked.
    const answer = readAnswer({ id: "q", type: "boolean", ask: "?" }, [0, 4], 1);
    if (answer.type !== "boolean") throw new Error("unreachable");
    expect(answer.p).toBeLessThan(0.1);
    expect(answer.confidence).toBeGreaterThan(0.9);
  });

  it("picks the argmax option and keeps the whole distribution in declared order", () => {
    const answer = readAnswer(choice, [0, 3, 1], 1);
    if (answer.type !== "choice") throw new Error("unreachable");
    expect(answer.chosen).toBe("track");
    expect(answer.p.get("track")).toBeCloseTo(answer.confidence, 10);
    expect([...answer.p.keys()]).toEqual(["refund", "track", "other"]);
  });

  it("computes a score as the probability-weighted mean of level indices", () => {
    const levels = ["calm", "annoyed", "angry"];
    const answer = readAnswer({ id: "q", type: "score", ask: "?", levels }, [-30, 0, -30], 1);
    if (answer.type !== "score") throw new Error("unreachable");
    // Essentially all mass on level 1, so the mean is level 1.
    expect(answer.score).toBeCloseTo(1, 6);
  });

  it("puts a split score between the two levels it is split across", () => {
    const levels = ["calm", "annoyed", "angry"];
    const answer = readAnswer({ id: "q", type: "score", ask: "?", levels }, [-30, 1, 0], 1);
    if (answer.type !== "score") throw new Error("unreachable");
    expect(answer.score).toBeGreaterThan(1);
    expect(answer.score).toBeLessThan(2);
  });

  it("always lands a score inside [0, levels-1]", () => {
    assert(
      property(
        array(double({ min: -20, max: 20, noNaN: true }), { minLength: 2, maxLength: 10 }),
        (logits) => {
          const levels = logits.map((_, i) => `level ${i}`);
          const answer = readAnswer({ id: "q", type: "score", ask: "?", levels }, logits, 1);
          if (answer.type !== "score") throw new Error("unreachable");
          expect(answer.score).toBeGreaterThanOrEqual(0);
          expect(answer.score).toBeLessThanOrEqual(levels.length - 1);
        },
      ),
    );
  });

  it("ignores logits beyond the question's label count", () => {
    // The caller slices a whole-vocabulary distribution; extra entries were
    // never candidates and must not dilute the ones that were.
    const two = readAnswer({ id: "q", type: "boolean", ask: "?" }, [1, 0], 1);
    const padded = readAnswer({ id: "q", type: "boolean", ask: "?" }, [1, 0, 9, 9], 1);
    if (two.type !== "boolean" || padded.type !== "boolean") throw new Error("unreachable");
    expect(padded.p).toBeCloseTo(two.p, 10);
  });

  it("applies the model's temperature, so the same logits calibrate differently", () => {
    const hot = readAnswer({ id: "q", type: "boolean", ask: "?" }, [3, 0], 2);
    const cold = readAnswer({ id: "q", type: "boolean", ask: "?" }, [3, 0], 1);
    if (hot.type !== "boolean" || cold.type !== "boolean") throw new Error("unreachable");
    expect(hot.p).toBeLessThan(cold.p);
  });
});
