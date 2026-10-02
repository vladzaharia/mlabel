import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import type { TargetedQuestion } from "./question";
import { DEFAULT_SHOW_ABOVE, isWorthShowing, severityOf } from "./threshold";

const bool = (p: number): Answer => ({
  id: "q",
  type: "boolean",
  p,
  confidence: Math.max(p, 1 - p),
});

const choiceQ = (over: Partial<TargetedQuestion> = {}): TargetedQuestion =>
  ({
    id: "q",
    type: "choice",
    ask: "?",
    options: [{ name: "refund" }, { name: "ordinary" }],
    ...over,
  }) as TargetedQuestion;

const chose = (name: string, confidence: number): Answer => ({
  id: "q",
  type: "choice",
  chosen: name,
  p: new Map([[name, confidence]]),
  confidence,
});

const scoreQ = (over: Partial<TargetedQuestion> = {}): TargetedQuestion =>
  ({
    id: "q",
    type: "score",
    ask: "?",
    levels: ["none", "weak", "moderate", "strong"],
    ...over,
  }) as TargetedQuestion;

describe("isWorthShowing", () => {
  it("hides a boolean that leans false", () => {
    expect(isWorthShowing(bool(0.1))).toBe(false);
  });

  it("shows a boolean above the default threshold", () => {
    expect(isWorthShowing(bool(0.9))).toBe(true);
  });

  it("hides a confident 'no' — a confident negative is not a finding", () => {
    // 0.02 true is 0.98 confident, but what it is confident about is "nothing to
    // see here". Measuring a boolean on confidence would put a note on every
    // clean record, which is the single worst outcome for this feature.
    expect(isWorthShowing(bool(0.02))).toBe(false);
  });

  it("honours a per-question override in both directions", () => {
    const at = (showAbove: number): TargetedQuestion => ({
      id: "q",
      type: "boolean",
      ask: "?",
      showAbove,
    });
    expect(isWorthShowing(bool(0.5), at(0.4))).toBe(true);
    expect(isWorthShowing(bool(0.5), at(0.8))).toBe(false);
  });

  it("measures a choice on how sure it is of what it chose", () => {
    expect(isWorthShowing(chose("refund", 0.5), choiceQ({ showAbove: 0.4 }))).toBe(true);
    expect(isWorthShowing(chose("refund", 0.5), choiceQ({ showAbove: 0.6 }))).toBe(false);
  });

  it("stays quiet about an option the config did not call notable", () => {
    // The model can be perfectly sure this is an ordinary mailbox, and that is
    // exactly when saying so costs attention and anchors for nothing.
    const q = choiceQ({ notable: ["refund"], showAbove: 0.4 });
    expect(isWorthShowing(chose("refund", 0.99), q)).toBe(true);
    expect(isWorthShowing(chose("ordinary", 0.99), q)).toBe(false);
  });

  it("surfaces every option when none were singled out", () => {
    expect(isWorthShowing(chose("ordinary", 0.99), choiceQ({ showAbove: 0.4 }))).toBe(true);
  });

  it("measures a score on confidence too", () => {
    const answer: Answer = { id: "q", type: "score", score: 1.5, p: [0.5, 0.5], confidence: 0.5 };
    expect(isWorthShowing(answer, scoreQ({ showAbove: 0.4 }))).toBe(true);
    expect(isWorthShowing(answer, scoreQ({ showAbove: 0.6 }))).toBe(false);
  });

  it("stays quiet about the quiet end of a scale", () => {
    const q = scoreQ({ notableFrom: 2, showAbove: 0.4 });
    const at = (score: number): Answer => ({ id: "q", type: "score", score, p: [], confidence: 1 });
    expect(isWorthShowing(at(0.4), q)).toBe(false);
    expect(isWorthShowing(at(1.9), q)).toBe(false);
    expect(isWorthShowing(at(2), q)).toBe(true);
    expect(isWorthShowing(at(3), q)).toBe(true);
  });

  it("defaults to a threshold above a coin flip but short of certainty", () => {
    expect(DEFAULT_SHOW_ABOVE).toBeGreaterThan(0.5);
    expect(DEFAULT_SHOW_ABOVE).toBeLessThan(1);
  });
});

describe("severityOf", () => {
  it("grades a boolean by how strongly it leans", () => {
    // Seven answers in one column, all the same grey, tell a reviewer the model
    // found seven equal things. It found one it is nearly sure of and several it
    // is guessing at, and that difference is the whole point of a calibrated
    // model.
    expect(severityOf(bool(0.97))).toBe("warning");
    expect(severityOf(bool(0.82))).toBe("info");
    expect(severityOf(bool(0.72))).toBe("muted");
  });

  it("grades a score by where it sits on its own scale, not by confidence", () => {
    // "Unmistakable, 60% sure" is a louder finding than "weak signs, 99% sure";
    // reading the second as louder would invert the scale the author wrote.
    const q = scoreQ();
    const at = (score: number, confidence: number): Answer => ({
      id: "q",
      type: "score",
      score,
      p: [],
      confidence,
    });
    expect(severityOf(at(3, 0.6), q)).toBe("warning");
    expect(severityOf(at(0.5, 0.99), q)).toBe("muted");
  });

  it("grades a choice by how sure it is", () => {
    expect(severityOf(chose("refund", 0.95))).toBe("warning");
    expect(severityOf(chose("refund", 0.6))).toBe("muted");
  });

  it("never reaches danger, whatever the model says", () => {
    // `danger` means "you must fix this" in this app. Nothing a 2B model says
    // earns that colour; borrowing it would make a guess look like a defect.
    const tones = [
      severityOf(bool(1)),
      severityOf(chose("refund", 1)),
      severityOf({ id: "q", type: "score", score: 3, p: [0, 0, 0, 1], confidence: 1 }, scoreQ()),
    ];
    expect(tones).not.toContain("danger");
  });
});
