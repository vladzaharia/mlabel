import { describe, expect, it } from "vitest";
import type { Answer } from "./answer";
import { DEFAULT_SHOW_ABOVE, isWorthShowing, severityOf } from "./threshold";

const bool = (p: number): Answer => ({
  id: "q",
  type: "boolean",
  p,
  confidence: Math.max(p, 1 - p),
});

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
    expect(isWorthShowing(bool(0.5), 0.4)).toBe(true);
    expect(isWorthShowing(bool(0.5), 0.8)).toBe(false);
  });

  it("measures a choice on how sure it is of what it chose", () => {
    const answer: Answer = {
      id: "q",
      type: "choice",
      chosen: "refund",
      p: new Map([["refund", 0.5]]),
      confidence: 0.5,
    };
    expect(isWorthShowing(answer, 0.4)).toBe(true);
    expect(isWorthShowing(answer, 0.6)).toBe(false);
  });

  it("measures a score on confidence too", () => {
    const answer: Answer = { id: "q", type: "score", score: 1.5, p: [0.5, 0.5], confidence: 0.5 };
    expect(isWorthShowing(answer, 0.4)).toBe(true);
    expect(isWorthShowing(answer, 0.6)).toBe(false);
  });

  it("defaults to a threshold above a coin flip but short of certainty", () => {
    expect(DEFAULT_SHOW_ABOVE).toBeGreaterThan(0.5);
    expect(DEFAULT_SHOW_ABOVE).toBeLessThan(1);
  });
});

describe("severityOf", () => {
  it("calls a crossed boolean a warning", () => {
    expect(severityOf(bool(0.95))).toBe("warning");
  });

  it("calls everything else info", () => {
    expect(severityOf({ id: "q", type: "score", score: 2, p: [0, 0, 1], confidence: 1 })).toBe(
      "info",
    );
  });

  it("never reaches danger, whatever the model says", () => {
    // `danger` means "you must fix this" in this app. Nothing a 2B model says
    // earns that colour; borrowing it would make a guess look like a defect.
    const tones = [
      severityOf(bool(1)),
      severityOf({ id: "q", type: "score", score: 3, p: [0, 0, 0, 1], confidence: 1 }),
    ];
    expect(tones).not.toContain("danger");
  });
});
