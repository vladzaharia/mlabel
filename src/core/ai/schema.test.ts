import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { buildOutputJsonSchema, parseModelOutput, type Scopes } from "./schema";

const scopes: Scopes = { fields: ["email", "username"], cards: ["who", "velocity"] };

const output = (findings: unknown[]): string => JSON.stringify({ reasoning: "…", findings });

describe("parseModelOutput", () => {
  it("accepts a well-formed response", () => {
    const result = parseModelOutput(
      output([{ field: "email", severity: "warning", reason: "Domain looks like a throwaway." }]),
      scopes,
    );
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([
      { field: "email", severity: "warning", reason: "Domain looks like a throwaway." },
    ]);
  });

  it("accepts a finding scoped to a card", () => {
    const result = parseModelOutput(
      output([{ card: "velocity", severity: "info", reason: "Rates look consistent." }]),
      scopes,
    );
    expect(result.findings[0]).toEqual({
      card: "velocity",
      severity: "info",
      reason: "Rates look consistent.",
    });
  });

  it("accepts a finding scoped to nothing in particular", () => {
    const result = parseModelOutput(
      output([{ severity: "info", reason: "Row looks ordinary." }]),
      scopes,
    );
    expect(result.findings[0]).toEqual({ severity: "info", reason: "Row looks ordinary." });
  });

  it("reads an empty findings list as nothing to say", () => {
    expect(parseModelOutput(output([]), scopes).findings).toEqual([]);
  });

  it("drops a finding whose reason is blank", () => {
    expect(parseModelOutput(output([{ severity: "info", reason: "  " }]), scopes).findings).toEqual(
      [],
    );
  });
});

// Observed repeatedly: the model emits the same sentence three or four times
// against the same field, which reads on screen as four separate problems and
// crowds out anything else it had to say. Nothing is lost by collapsing them —
// a finding repeated is not a finding corroborated.
describe("parseModelOutput — duplicates", () => {
  const twice = (finding: Record<string, unknown>) =>
    JSON.stringify({ reasoning: "", findings: [finding, { ...finding }] });

  it("keeps one copy of an identical finding", () => {
    const raw = twice({ field: "email", severity: "warning", reason: "Throwaway domain." });
    expect(parseModelOutput(raw, scopes).findings).toHaveLength(1);
  });

  it("keeps the same sentence when it is about a different field", () => {
    const raw = JSON.stringify({
      reasoning: "",
      findings: [
        { field: "email", severity: "info", reason: "Same as the other." },
        { field: "username", severity: "info", reason: "Same as the other." },
      ],
    });
    expect(parseModelOutput(raw, scopes).findings).toHaveLength(2);
  });

  it("treats whitespace-only differences as the same finding", () => {
    const raw = JSON.stringify({
      reasoning: "",
      findings: [
        { field: "email", severity: "info", reason: "Throwaway domain." },
        { field: "email", severity: "info", reason: "  Throwaway domain.  " },
      ],
    });
    expect(parseModelOutput(raw, scopes).findings).toHaveLength(1);
  });
});

describe("parseModelOutput — refusals", () => {
  it("reports non-JSON rather than throwing", () => {
    const result = parseModelOutput("Sure! Here's what I found:", scopes);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/JSON/);
  });

  // The three ways a decode can come back unusable are three different bugs,
  // and a single message for all of them sent the last investigation at the
  // grammar when the fault was in the chat wrapper.
  it("names an empty answer as empty rather than as bad JSON", () => {
    const result = parseModelOutput("", scopes);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nothing/i);
  });

  it("names a cut-off answer as cut off", () => {
    // What hitting the token cap mid-`reasoning` actually looks like.
    const result = parseModelOutput('{\n  "reasoning": "The row contains a user', scopes);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cut off/i);
  });

  // A truncated answer whose `findings` never opened looks exactly like a clean
  // record. Reporting it as clean is the one wrong answer that costs a reviewer
  // something, so truncation stays a failure and never becomes "nothing stood out".
  it("never reports a cut-off answer as clean", () => {
    const result = parseModelOutput('{"reasoning": "abc', scopes);
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([]);
  });

  // The grammar makes this unreachable; the check stays because a schema that
  // only holds when another component is correct is not a check.
  it("refuses a field the config does not have", () => {
    expect(
      parseModelOutput(output([{ field: "ghost", severity: "info", reason: "x" }]), scopes).ok,
    ).toBe(false);
  });

  it("refuses a card the config does not have", () => {
    expect(
      parseModelOutput(output([{ card: "ghost", severity: "info", reason: "x" }]), scopes).ok,
    ).toBe(false);
  });

  it("refuses a severity the app does not have", () => {
    // `danger` means "you must fix this" here, and is not the model's to use.
    expect(parseModelOutput(output([{ severity: "danger", reason: "x" }]), scopes).ok).toBe(false);
  });

  it("refuses extra keys, so a drifting model is caught rather than trusted", () => {
    const value = JSON.stringify({ reasoning: "", findings: [], verdict: "fraud" });
    expect(parseModelOutput(value, scopes).ok).toBe(false);
  });

  it("refuses more findings than the panel can show", () => {
    const many = Array.from({ length: 9 }, () => ({ severity: "info", reason: "x" }));
    expect(parseModelOutput(output(many), scopes).ok).toBe(false);
  });

  it("refuses a reason too long to sit beside a form field", () => {
    expect(
      parseModelOutput(output([{ severity: "info", reason: "x".repeat(400) }]), scopes).ok,
    ).toBe(false);
  });

  test.prop([fc.anything()])("never throws, whatever the model emitted", (anything) => {
    expect(() => parseModelOutput(anything, scopes)).not.toThrow();
  });
});

describe("buildOutputJsonSchema", () => {
  const items = (s: Scopes): Record<string, unknown> => {
    const schema = buildOutputJsonSchema(s) as {
      properties: { findings: { items: { properties: Record<string, unknown> } } };
    };
    return schema.properties.findings.items.properties;
  };

  // The point of building this per config: the model cannot spell a column that
  // does not exist, so hallucinated scope is unrepresentable rather than filtered.
  it("constrains scope to names that actually exist", () => {
    expect(items(scopes)["field"]).toEqual({ enum: ["email", "username"] });
    expect(items(scopes)["card"]).toEqual({ enum: ["who", "velocity"] });
  });

  // `enum: []` is either a grammar matching nothing or an outright error,
  // depending on the builder — and neither is what "no cards" should mean.
  it("omits a scope the config has none of, rather than offering an empty choice", () => {
    const withoutCards = items({ fields: ["email"], cards: [] });
    expect(withoutCards["card"]).toBeUndefined();
    expect(withoutCards["field"]).toBeDefined();
  });

  // Constraining the format degrades a small model's judgement; a prose field it
  // fills in first recovers most of that, and only if it comes first.
  it("puts the model's scratch space before the structured fields", () => {
    const schema = buildOutputJsonSchema(scopes) as { properties: Record<string, unknown> };
    const keys = Object.keys(schema.properties);
    expect(keys.indexOf("reasoning")).toBeLessThan(keys.indexOf("findings"));
  });

  // The grammar builder silently ignores `required` and rejects `pattern` and
  // numeric bounds, so including them would give a false sense of enforcement.
  it("uses only keywords the grammar builder understands", () => {
    const text = JSON.stringify(buildOutputJsonSchema(scopes));
    for (const unsupported of ["pattern", "required", "minimum", "maximum", "minLength"]) {
      expect(text).not.toContain(`"${unsupported}"`);
    }
  });
});
