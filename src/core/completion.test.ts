import { describe, expect, it } from "vitest";
import { evaluateRecord, validateOutputValue } from "./completion";
import { seedLabelValues } from "./automapping";
import { buildConfig } from "@test/fixtures/config";
import type { OutputField } from "./config/schema";

const config = buildConfig({
  input: ["id"],
  output: [
    { name: "id", kind: "copied" },
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
    { name: "score", kind: "number", min: 0, max: 10 },
    { name: "note", required: false, maxLength: 5 },
  ],
});
const outputFields = config.output.fields;

const byName = new Map(outputFields.map((f) => [f.name, f]));
const field = (name: string): OutputField => {
  const f = byName.get(name);
  if (!f) throw new Error(`no such field: ${name}`);
  return f;
};

describe("evaluateRecord", () => {
  it("is complete when every required field is provided and valid", () => {
    const result = evaluateRecord({ id: "1", verdict: "good", score: 5 }, outputFields);
    expect(result.status).toBe("complete");
    expect(result.errors).toEqual([]);
  });

  it("is unlabeled when only derived values are present", () => {
    // A copied `id` is not something the labeler did, so the record has not
    // been started — this is what keeps the progress bar honest.
    expect(evaluateRecord({ id: "1" }, outputFields).status).toBe("unlabeled");
  });

  it("is partial once a user field is filled but a required one is missing", () => {
    expect(evaluateRecord({ id: "1", verdict: "good" }, outputFields).status).toBe("partial");
  });

  it("is not complete when a required field is missing", () => {
    expect(evaluateRecord({ id: "1", score: 5 }, outputFields).status).not.toBe("complete");
  });

  // The old default made every derived field required, so an unfilled one sent
  // every record to the remaining file while the export reported success.
  it("does not require a derived field to be present", () => {
    expect(evaluateRecord({ verdict: "good", score: 5 }, outputFields).status).toBe("complete");
  });

  it("ignores an absent optional field", () => {
    expect(evaluateRecord({ id: "1", verdict: "good", score: 5 }, outputFields).status).toBe(
      "complete",
    );
  });

  it("reports an invalid choice", () => {
    const result = evaluateRecord({ verdict: "meh", score: 5 }, outputFields);
    expect(result.status).not.toBe("complete");
    expect(result.errors[0]).toMatchObject({ field: "verdict" });
    expect(result.errors[0]?.message).toMatch(/good, bad/);
  });

  it("blocks completion on an invalid value even in an optional field", () => {
    const result = evaluateRecord(
      { verdict: "good", score: 5, note: "far too long" },
      outputFields,
    );
    expect(result.status).not.toBe("complete");
    expect(result.errors[0]).toMatchObject({ field: "note" });
  });
});

describe("validateOutputValue", () => {
  it("enforces numeric bounds", () => {
    expect(validateOutputValue(field("score"), 5)).toBeNull();
    expect(validateOutputValue(field("score"), -1)).toMatch(/≥ 0/);
    expect(validateOutputValue(field("score"), 11)).toMatch(/≤ 10/);
    expect(validateOutputValue(field("score"), "x")).toMatch(/number/);
  });

  it("enforces text length", () => {
    expect(validateOutputValue(field("note"), "ok")).toBeNull();
    expect(validateOutputValue(field("note"), "much too long")).toMatch(/at most 5/);
  });

  it("enforces the choice set", () => {
    expect(validateOutputValue(field("verdict"), "good")).toBeNull();
    expect(validateOutputValue(field("verdict"), "meh")).toMatch(/good, bad/);
  });

  it("rejects a whole number where a fraction is not allowed", () => {
    const ints = buildConfig({
      output: [{ name: "count", kind: "number" }],
    });
    const asInteger = { ...ints.output.fields[0]!, type: "integer" as const } as OutputField;
    expect(validateOutputValue(asInteger, 3)).toBeNull();
    expect(validateOutputValue(asInteger, 3.5)).toMatch(/whole number/);
  });

  // Multi-select ships in v2; the old widget-keyed switch could not express it.
  it("checks every item of a multi-select against the choice set", () => {
    const multi = buildConfig({
      output: [{ name: "topics", kind: "text" }],
    });
    const arrayField = {
      ...multi.output.fields[0]!,
      type: "array" as const,
      items: { type: "enum" as const, choices: [{ name: "a" }, { name: "b" }] },
    } as unknown as OutputField;
    expect(validateOutputValue(arrayField, ["a", "b"])).toBeNull();
    expect(validateOutputValue(arrayField, ["a", "zzz"])).toMatch(/a, b/);
    expect(validateOutputValue(arrayField, "a")).toMatch(/list/);
  });
});

describe("seedLabelValues", () => {
  it("copies input values and leaves user fields unfilled", () => {
    const seeded = seedLabelValues({ id: "row-1" }, outputFields);
    expect(seeded).toEqual({
      id: "row-1",
      verdict: undefined,
      score: undefined,
      note: undefined,
    });
  });

  it("produces a record that reads as unlabeled", () => {
    const seeded = seedLabelValues({ id: "row-1" }, outputFields);
    expect(evaluateRecord(seeded, outputFields).status).toBe("unlabeled");
  });
});
