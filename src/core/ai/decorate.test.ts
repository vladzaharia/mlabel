import { describe, expect, it } from "vitest";
import { decorationsFromAnalysis, mergeDecorations } from "./decorate";
import type { TargetedQuestion } from "./question";
import type { Analysis } from "./types";

const questions: TargetedQuestion[] = [
  { id: "odd", type: "boolean", field: "age", ask: "Is the age odd for this person?" },
  { id: "intent", type: "choice", card: "main", ask: "?", options: [{ name: "a" }, { name: "b" }] },
  { id: "overall", type: "boolean", ask: "Anything wrong?" },
  { id: "picky", type: "boolean", field: "age", ask: "Picky?", showAbove: 0.2 },
];

const analysis = (answers: Analysis["answers"]): Analysis => ({
  recordIndex: 0,
  status: "findings",
  answers,
  modelId: "jevk5-4b",
});

describe("decorationsFromAnalysis", () => {
  it("puts a crossed field answer beside its field, marked as the model's", () => {
    const decorations = decorationsFromAnalysis(
      analysis([{ id: "odd", type: "boolean", p: 0.93, confidence: 0.93 }]),
      questions,
    );
    const field = decorations.fields.get("age");
    expect(field).toHaveLength(1);
    expect(field?.[0]?.source).toBe("model");
    expect(field?.[0]?.rule).toBe("model:jevk5-4b");
    expect(field?.[0]?.style.tone).toBe("warning");
    expect(field?.[0]?.style.note).toContain("93%");
  });

  it("omits an answer below its threshold", () => {
    const decorations = decorationsFromAnalysis(
      analysis([{ id: "odd", type: "boolean", p: 0.2, confidence: 0.8 }]),
      questions,
    );
    expect(decorations.fields.size).toBe(0);
  });

  it("honours a question's own showAbove", () => {
    const decorations = decorationsFromAnalysis(
      analysis([{ id: "picky", type: "boolean", p: 0.3, confidence: 0.7 }]),
      questions,
    );
    expect(decorations.fields.get("age")).toHaveLength(1);
  });

  it("places a card answer on its card as info, not warning", () => {
    const decorations = decorationsFromAnalysis(
      analysis([
        { id: "intent", type: "choice", chosen: "a", p: new Map([["a", 0.9]]), confidence: 0.9 },
      ]),
      questions,
    );
    expect(decorations.cards.get("main")?.[0]?.style.tone).toBe("info");
    expect(decorations.cards.get("main")?.[0]?.style.note).toContain("a (90%)");
  });

  it("leaves a record-level answer for the panel", () => {
    // An unscoped remark has nowhere sensible to sit in the form, and would have
    // to be duplicated onto every field to appear at all.
    const decorations = decorationsFromAnalysis(
      analysis([{ id: "overall", type: "boolean", p: 0.99, confidence: 0.99 }]),
      questions,
    );
    expect(decorations.fields.size).toBe(0);
    expect(decorations.cards.size).toBe(0);
  });

  it("ignores an answer whose question is gone — a config edited mid-session", () => {
    // The cache outlives a config reload, and a note nobody can trace back to a
    // question is worse than no note.
    const decorations = decorationsFromAnalysis(
      analysis([{ id: "vanished", type: "boolean", p: 0.99, confidence: 0.99 }]),
      questions,
    );
    expect(decorations.fields.size).toBe(0);
  });

  it("is empty for no analysis at all", () => {
    expect(decorationsFromAnalysis(undefined, questions).fields.size).toBe(0);
    expect(decorationsFromAnalysis(analysis([]), questions).fields.size).toBe(0);
  });
});

describe("mergeDecorations", () => {
  it("keeps an authored note and a model note on the same field, authored first", () => {
    const authored = {
      fields: new Map([
        ["age", [{ rule: "r", style: { tone: "warning" as const, note: "rule" } }]],
      ]),
      cards: new Map(),
      items: new Map(),
    };
    const model = decorationsFromAnalysis(
      analysis([{ id: "odd", type: "boolean", p: 0.99, confidence: 0.99 }]),
      questions,
    );
    const merged = mergeDecorations(authored, model);
    const notes = merged.fields.get("age")?.map((d) => d.style.note);
    expect(notes?.[0]).toBe("rule");
    expect(notes).toHaveLength(2);
  });
});
