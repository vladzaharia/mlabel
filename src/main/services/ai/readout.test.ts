import { describe, expect, it } from "vitest";
import { assertSingleTokenLabels, labelLogits, UNSEEN_LOGIT } from "./readout";

describe("labelLogits", () => {
  it("pulls the label tokens' probabilities out in label order, not map order", () => {
    // `controlledEvaluate` returns its map sorted by probability, so relying on
    // iteration order here would silently reorder the answers.
    const probabilities = new Map([
      [99, 0.5],
      [11, 0.3],
      [10, 0.15],
      [12, 0.05],
    ]);
    expect(labelLogits(probabilities, [10, 11, 12])).toEqual([
      Math.log(0.15),
      Math.log(0.3),
      Math.log(0.05),
    ]);
  });

  it("floors a label the model gave no mass to, rather than taking log(0)", () => {
    // `log(0)` is -Infinity, which turns the softmax into NaN and would surface
    // as "NaN%" beside a field.
    const [first, second] = labelLogits(new Map([[10, 1]]), [10, 11]);
    expect(Number.isFinite(second)).toBe(true);
    expect(second).toBe(UNSEEN_LOGIT);
    expect(second).toBeLessThan(first!);
  });

  it("floors a label whose probability came back as zero", () => {
    expect(labelLogits(new Map([[10, 0]]), [10])).toEqual([UNSEEN_LOGIT]);
  });

  it("ignores vocabulary entries that are not labels", () => {
    const probabilities = new Map([
      [7, 0.99],
      [10, 0.01],
    ]);
    expect(labelLogits(probabilities, [10])).toEqual([Math.log(0.01)]);
  });
});

describe("assertSingleTokenLabels", () => {
  it("returns the token id for each label when every one is a single token", () => {
    expect(assertSingleTokenLabels(["A", "B"], (text) => [text.charCodeAt(0)])).toEqual([65, 66]);
  });

  it("throws, naming the label, when one tokenizes to more than one token", () => {
    // Silently mis-scoring every record is the worst outcome available here, so
    // this fails at load rather than at read.
    expect(() =>
      assertSingleTokenLabels(["A", "B"], (text) => (text === "B" ? [1, 2] : [1])),
    ).toThrow(/"B"/);
  });

  it("throws when a label tokenizes to nothing at all", () => {
    expect(() => assertSingleTokenLabels(["A"], () => [])).toThrow(/"A"/);
  });

  it("says how many tokens it got, so the message explains itself", () => {
    expect(() => assertSingleTokenLabels(["A"], () => [1, 2, 3])).toThrow(/3 tokens/);
  });
});
