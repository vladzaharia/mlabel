import { describe, expect, it } from "vitest";
import { evaluateRecord, validateOutputValue } from "./completion";
import { seedLabelValues } from "./automapping";
import type { OutputField } from "./config/schema";

function field(partial: Partial<OutputField> & Pick<OutputField, "name" | "control">): OutputField {
  return { required: true, labelPosition: "left", textSize: "md", ...partial } as OutputField;
}

const inputNames = new Set(["id"]);

describe("evaluateRecord", () => {
  const fields: OutputField[] = [
    field({ name: "id", control: "hidden" }),
    field({ name: "verdict", control: "radio", options: [{ value: "good" }, { value: "bad" }] }),
    field({ name: "notes", control: "textarea", required: false }),
  ];

  it("is unlabeled when only auto-copied fields are present", () => {
    const r = evaluateRecord({ id: "1", verdict: undefined, notes: undefined }, fields, inputNames);
    expect(r.status).toBe("unlabeled");
  });

  it("is partial when a required field is still missing", () => {
    const r = evaluateRecord({ id: "1", verdict: undefined, notes: "hmm" }, fields, inputNames);
    expect(r.status).toBe("partial");
  });

  it("is complete when all required fields are valid", () => {
    const r = evaluateRecord({ id: "1", verdict: "good", notes: undefined }, fields, inputNames);
    expect(r.status).toBe("complete");
    expect(r.errors).toHaveLength(0);
  });

  it("is not complete when a required auto-copied value is empty", () => {
    const r = evaluateRecord({ id: null, verdict: "good" }, fields, inputNames);
    expect(r.status).not.toBe("complete");
  });

  it("reports invalid enum choices", () => {
    const r = evaluateRecord({ id: "1", verdict: "maybe" }, fields, inputNames);
    expect(r.errors.some((e) => e.field === "verdict")).toBe(true);
  });
});

describe("validateOutputValue — rules", () => {
  it("enforces number min/max", () => {
    const f = field({ name: "n", control: "number", min: 0, max: 10 });
    expect(validateOutputValue(f, 5)).toBeNull();
    expect(validateOutputValue(f, 11)).toMatch(/≤/);
  });

  it("enforces text length and regex", () => {
    const f = field({ name: "t", control: "text", minLength: 2, regex: "^[a-z]+$" });
    expect(validateOutputValue(f, "abc")).toBeNull();
    expect(validateOutputValue(f, "A")).not.toBeNull();
  });
});

describe("seedLabelValues (auto-mapping)", () => {
  it("copies same-named input values and leaves user fields undefined", () => {
    const fields: OutputField[] = [
      field({ name: "id", control: "hidden" }),
      field({ name: "verdict", control: "select", options: [{ value: "good" }] }),
    ];
    const seeded = seedLabelValues({ id: "abc" }, fields, inputNames);
    expect(seeded["id"]).toBe("abc");
    expect(seeded["verdict"]).toBeUndefined();
  });
});
