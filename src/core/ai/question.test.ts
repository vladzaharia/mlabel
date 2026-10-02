import { describe, expect, it } from "vitest";
import { answerLabel } from "./answer";
import { labelCount, type TargetedQuestion } from "./question";

const choice: TargetedQuestion = {
  id: "intent",
  type: "choice",
  ask: "What does the customer want?",
  options: [{ name: "refund" }, { name: "track" }],
};

describe("labelCount", () => {
  it("is 2 for a boolean regardless of criteria", () => {
    expect(labelCount({ id: "q", type: "boolean", ask: "?" })).toBe(2);
  });

  it("is the option count for a choice", () => {
    expect(labelCount(choice)).toBe(2);
  });

  it("is the level count for a score", () => {
    expect(labelCount({ id: "q", type: "score", ask: "?", levels: ["a", "b", "c"] })).toBe(3);
  });
});

describe("answerLabel", () => {
  it("describes a boolean as a percentage", () => {
    expect(answerLabel({ id: "q", type: "boolean", p: 0.82, confidence: 0.82 })).toBe("82%");
  });

  it("names the chosen option for a choice", () => {
    expect(
      answerLabel({
        id: "q",
        type: "choice",
        chosen: "refund",
        p: new Map([["refund", 0.84]]),
        confidence: 0.84,
      }),
    ).toBe("refund (84%)");
  });

  it("rounds a score to one decimal", () => {
    // Deliberately not a value ending in 5: `toFixed` rounds the *binary* double,
    // and 1.15 is stored a hair below 1.15, so it yields "1.1". Asserting a tie
    // here would be testing IEEE 754, not this function.
    expect(
      answerLabel({ id: "q", type: "score", score: 1.16, p: [0, 0.84, 0.16], confidence: 0.84 }),
    ).toBe("1.2");
    expect(answerLabel({ id: "q", type: "score", score: 2.0, p: [0, 0, 1], confidence: 1 })).toBe(
      "2.0",
    );
  });
});
