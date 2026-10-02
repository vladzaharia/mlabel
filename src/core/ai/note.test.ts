import { describe, expect, it } from "vitest";
import { noteFor } from "./note";
import type { TargetedQuestion } from "./question";

const bool: TargetedQuestion = {
  id: "minted",
  type: "boolean",
  field: "email",
  ask: "Does the domain look registered in bulk to send or receive signup mail, rather than belonging to a real business, school, ISP or mail provider?",
  note: "Domain looks minted for signups.",
};

const choice: TargetedQuestion = {
  id: "kind",
  type: "choice",
  field: "email",
  ask: "What kind of mail domain is this?",
  note: "Mail domain",
  options: [{ name: "major-consumer" }, { name: "minted-for-signups" }],
};

const score: TargetedQuestion = {
  id: "speed",
  type: "score",
  card: "events",
  ask: "How long after the account was created was it activated?",
  note: "Activated",
  levels: ["minutes or longer", "under a minute", "under ten seconds", "within about a second"],
};

describe("noteFor", () => {
  it("states what was found, rather than repeating the question", () => {
    const note = noteFor(bool, { id: "minted", type: "boolean", p: 0.88, confidence: 0.88 });
    expect(note).toBe("Domain looks minted for signups. 88%");
    expect(note).not.toContain("?");
  });

  it("names the chosen option for a choice", () => {
    const note = noteFor(choice, {
      id: "kind",
      type: "choice",
      chosen: "minted-for-signups",
      p: new Map([["minted-for-signups", 0.48]]),
      confidence: 0.48,
    });
    expect(note).toBe("Mail domain: minted-for-signups (48%)");
  });

  it("names the nearest level for a score, keeping the number as the qualifier", () => {
    // "1.9" alone is unreadable at a glance — the reviewer would have to go back
    // to the config to learn what level 1.9 sits between.
    const note = noteFor(score, {
      id: "speed",
      type: "score",
      score: 1.9,
      p: [0, 0.1, 0.9, 0],
      confidence: 0.9,
    });
    expect(note).toBe("Activated: under ten seconds (1.9)");
  });

  it("rounds a score to its nearest level, not downward", () => {
    const note = noteFor(score, { id: "speed", type: "score", score: 1.2, p: [], confidence: 1 });
    expect(note).toContain("under a minute");
  });

  it("clamps a score that lands past the last level", () => {
    const note = noteFor(score, { id: "speed", type: "score", score: 3, p: [], confidence: 1 });
    expect(note).toContain("within about a second");
  });

  it("falls back to the question when no note was written", () => {
    // Better a long note than none, but the config schema nudges authors to
    // supply one and the docs say why.
    const bare: TargetedQuestion = { id: "q", type: "boolean", ask: "Is it odd?" };
    expect(noteFor(bare, { id: "q", type: "boolean", p: 0.9, confidence: 0.9 })).toBe(
      "Is it odd? 90%",
    );
  });
});
