import { describe, expect, it } from "vitest";
import { hasModelDecoration, notesOf, toneOf, type Decorations } from "../decorations";
import { decorationsFromAnalysis, mergeDecorations } from "./decorate";
import type { Analysis } from "./types";

const analysis = (findings: Analysis["findings"]): Analysis => ({
  recordIndex: 0,
  status: "findings",
  findings,
  modelId: "qwen3.5-2b",
});

const empty: Decorations = { fields: new Map(), cards: new Map(), items: new Map() };

describe("decorationsFromAnalysis", () => {
  it("puts a field-scoped finding on that field", () => {
    const { fields } = decorationsFromAnalysis(
      analysis([{ field: "email", severity: "warning", reason: "Throwaway domain." }]),
    );
    expect(notesOf(fields.get("email"))).toEqual(["Throwaway domain."]);
    expect(toneOf(fields.get("email"))).toBe("warning");
  });

  it("puts a card-scoped finding on that card", () => {
    const { cards } = decorationsFromAnalysis(
      analysis([{ card: "velocity", severity: "info", reason: "Rates look steady." }]),
    );
    expect(notesOf(cards.get("velocity"))).toEqual(["Rates look steady."]);
  });

  // An unscoped remark has nowhere sensible to sit in the form, and repeating it
  // on every field to make it visible would be worse than leaving it to the panel.
  it("leaves an unscoped finding for the panel", () => {
    const result = decorationsFromAnalysis(
      analysis([{ severity: "info", reason: "Row looks ordinary." }]),
    );
    expect(result.fields.size).toBe(0);
    expect(result.cards.size).toBe(0);
  });

  it("maps info to info and warning to warning, never further", () => {
    const { fields } = decorationsFromAnalysis(
      analysis([{ field: "a", severity: "info", reason: "x" }]),
    );
    // `danger` means "you must fix this" in this app and is not the model's.
    expect(toneOf(fields.get("a"))).toBe("info");
  });

  it("marks everything it produces as model-sourced", () => {
    const { fields } = decorationsFromAnalysis(
      analysis([{ field: "a", severity: "warning", reason: "x" }]),
    );
    expect(hasModelDecoration(fields.get("a"))).toBe(true);
  });

  it("is empty for a clean record or no analysis at all", () => {
    expect(decorationsFromAnalysis(undefined).fields.size).toBe(0);
    expect(decorationsFromAnalysis(analysis([])).fields.size).toBe(0);
  });
});

describe("mergeDecorations", () => {
  const authored: Decorations = {
    ...empty,
    fields: new Map([
      ["email", [{ rule: "canned", style: { tone: "danger" as const, note: "Author says so." } }]],
    ]),
  };
  const model = decorationsFromAnalysis(
    analysis([{ field: "email", severity: "warning", reason: "Model says so." }]),
  );

  it("keeps both notes on a shared field, authored first", () => {
    const { fields } = mergeDecorations(authored, model);
    expect(notesOf(fields.get("email"))).toEqual(["Author says so.", "Model says so."]);
  });

  // The important one. A guess must not recolour a field an author already
  // styled — that would overwrite a statement with a suggestion.
  it("lets the authored tone win over the model's", () => {
    const { fields } = mergeDecorations(authored, model);
    expect(toneOf(fields.get("email"))).toBe("danger");
  });

  it("uses the model's tone where the author said nothing", () => {
    const { fields } = mergeDecorations(empty, model);
    expect(toneOf(fields.get("email"))).toBe("warning");
  });

  it("does not mutate either side", () => {
    const before = notesOf(authored.fields.get("email"));
    mergeDecorations(authored, model);
    expect(notesOf(authored.fields.get("email"))).toEqual(before);
  });

  // Per-item decorations come from `forEach` rules; the model works a record at
  // a time and has no notion of a row inside a list.
  it("leaves per-item decorations to the rules", () => {
    const withItems: Decorations = {
      ...empty,
      items: new Map([["recent", [[{ rule: "r", style: { tone: "warning" as const } }]]]]),
    };
    expect(mergeDecorations(withItems, model).items.get("recent")).toHaveLength(1);
  });
});
