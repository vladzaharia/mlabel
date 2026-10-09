import { describe, expect, it } from "vitest";
import { BUILT_IN_IDS, BUILT_IN_QUESTIONS, isBuiltIn } from "./builtins";

describe("built-in questions", () => {
  it("asks whether the record is anomalous and whether it is ambiguous", () => {
    expect(BUILT_IN_IDS).toEqual(["anomalous", "ambiguous"]);
  });

  it("asks both of the record as a whole, not of a field or a card", () => {
    for (const question of BUILT_IN_QUESTIONS) {
      expect(question.field).toBeUndefined();
      expect(question.card).toBeUndefined();
    }
  });

  it("asks both as booleans, so the two probabilities are directly comparable", () => {
    for (const question of BUILT_IN_QUESTIONS) expect(question.type).toBe("boolean");
  });

  it("says nothing about any particular kind of data", () => {
    // These ship with the app, so they cannot assume anything about the file.
    // Anything specific to one dataset belongs in `ai.questions`, written by the
    // person who knows it.
    for (const question of BUILT_IN_QUESTIONS) {
      expect(question.ask.toLowerCase()).not.toMatch(/customer|order|invoice|ticket/);
    }
  });

  it("recognises its own ids and nothing else", () => {
    expect(isBuiltIn("anomalous")).toBe(true);
    expect(isBuiltIn("ambiguous")).toBe(true);
    expect(isBuiltIn("intent")).toBe(false);
  });
});
