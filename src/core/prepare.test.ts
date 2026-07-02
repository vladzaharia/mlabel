import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  chunkSizes,
  findDuplicateRecords,
  headersMatch,
  outputCoercionType,
  splitRecords,
  validateInputRecord,
  validateOutputRecord,
} from "./prepare";
import { loadConfig } from "./config";
import type { AppConfig } from "./config";
import type { ProvenanceToken, RawFieldValue, RawRecord } from "./types/source";

const config = loadAppConfig();

function loadAppConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [
        { "name": "id", "type": { "type": "text" } },
        { "name": "count", "type": { "type": "number", "format": "integer" } },
        { "name": "tags", "type": { "type": "array", "items": { "type": "text" } } }
      ],
      "categories": [
        { "id": "c", "displayName": "C", "rows": [{ "fields": ["id", "count", "tags"] }] }
      ]
    },
    "output": {
      "fields": [
        { "name": "id", "control": "hidden" },
        { "name": "tags", "control": "hidden" },
        { "name": "verdict", "control": "radio", "options": [{ "value": "good" }, { "value": "bad" }] },
        { "name": "score", "control": "slider", "min": 0, "max": 10 },
        { "name": "flag", "control": "checkbox" },
        { "name": "when", "control": "date" },
        { "name": "note", "control": "text", "required": false }
      ]
    }
  }`);
  if (!result.ok) throw new Error("invalid test config");
  return result.config;
}

const provenance: ProvenanceToken = { __adapter: "test", __raw: null };

function record(index: number, fields: Record<string, RawFieldValue>): RawRecord {
  return { index, fields, provenance };
}

const completeOutputFields: Record<string, RawFieldValue> = {
  id: "1",
  tags: '["a","b"]',
  verdict: "good",
  score: "5",
  flag: "true",
  when: "2024-01-02",
  note: "",
};

describe("chunkSizes", () => {
  it("splits contiguously with larger chunks first", () => {
    expect(chunkSizes(10, 3)).toEqual([4, 3, 3]);
    expect(chunkSizes(6, 3)).toEqual([2, 2, 2]);
    expect(chunkSizes(5, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(chunkSizes(7, 1)).toEqual([7]);
  });

  it("throws outside 1..total", () => {
    expect(() => chunkSizes(3, 0)).toThrow(RangeError);
    expect(() => chunkSizes(3, 4)).toThrow(RangeError);
    expect(() => chunkSizes(0, 1)).toThrow(RangeError);
  });

  test.prop([
    fc
      .integer({ min: 1, max: 500 })
      .chain((t) => fc.tuple(fc.constant(t), fc.integer({ min: 1, max: t }))),
  ])("sizes sum to total, differ by at most one, and never increase", ([total, parts]) => {
    const sizes = chunkSizes(total, parts);
    expect(sizes).toHaveLength(parts);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
  });
});

describe("splitRecords", () => {
  const records = Array.from({ length: 7 }, (_, i) => record(i, { id: String(i) }));

  it("keeps order and contiguity", () => {
    const chunks = splitRecords(records, 3);
    expect(chunks.map((c) => c.length)).toEqual([3, 2, 2]);
    expect(chunks.flat()).toEqual(records);
  });

  test.prop([fc.integer({ min: 1, max: 7 })])("flattening restores the input", (parts) => {
    expect(splitRecords(records, parts).flat()).toEqual(records);
  });
});

describe("headersMatch", () => {
  it("requires exact ordered equality", () => {
    expect(headersMatch(["a", "b"], ["a", "b"])).toBe(true);
    expect(headersMatch(["a", "b"], ["b", "a"])).toBe(false);
    expect(headersMatch(["a"], ["a", "b"])).toBe(false);
    expect(headersMatch([], [])).toBe(true);
  });
});

describe("findDuplicateRecords", () => {
  it("warns on every repeat of an identical row", () => {
    const records = [
      record(0, { id: "1", note: "x" }),
      record(1, { id: "2", note: "y" }),
      record(2, { id: "1", note: "x" }),
      record(3, { id: "1", note: "x" }),
    ];
    const issues = findDuplicateRecords(["id", "note"], records);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.kind === "duplicate" && i.severity === "warning")).toBe(true);
    expect(issues.map((i) => i.recordIndex)).toEqual([2, 3]);
  });

  it("is silent for distinct rows", () => {
    const records = [record(0, { id: "1" }), record(1, { id: "2" })];
    expect(findDuplicateRecords(["id"], records)).toEqual([]);
  });
});

describe("outputCoercionType", () => {
  const field = (name: string) => config.output.fields.find((f) => f.name === name)!;

  it("uses the matching input field's type so composites round-trip", () => {
    expect(outputCoercionType(field("id"), config)).toEqual({ type: "text" });
    expect(outputCoercionType(field("tags"), config)).toEqual({
      type: "array",
      items: { type: "text" },
    });
  });

  it("maps controls to types when there is no input match", () => {
    expect(outputCoercionType(field("verdict"), config)).toEqual({ type: "text" });
    expect(outputCoercionType(field("score"), config)).toEqual({ type: "number" });
    expect(outputCoercionType(field("flag"), config)).toEqual({ type: "bool" });
    expect(outputCoercionType(field("when"), config)).toEqual({ type: "date" });
    expect(outputCoercionType(field("note"), config)).toEqual({ type: "text" });
  });
});

describe("validateOutputRecord", () => {
  it("accepts a complete, valid row", () => {
    expect(validateOutputRecord(record(0, completeOutputFields), config, 0)).toEqual([]);
  });

  it("flags a missing required value", () => {
    const issues = validateOutputRecord(
      record(0, { ...completeOutputFields, verdict: "" }),
      config,
      4,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "missing",
      severity: "error",
      field: "verdict",
      recordIndex: 4,
    });
  });

  it("flags an invalid enum value", () => {
    const issues = validateOutputRecord(
      record(0, { ...completeOutputFields, verdict: "meh" }),
      config,
      1,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: "schema", severity: "error", field: "verdict" });
  });

  it("flags out-of-range and non-numeric slider values", () => {
    const outOfRange = validateOutputRecord(
      record(0, { ...completeOutputFields, score: "12" }),
      config,
      0,
    );
    expect(outOfRange[0]).toMatchObject({ kind: "schema", field: "score" });

    const notANumber = validateOutputRecord(
      record(0, { ...completeOutputFields, score: "abc" }),
      config,
      0,
    );
    expect(notANumber.some((i) => i.kind === "coercion" && i.field === "score")).toBe(true);
  });

  it("flags malformed JSON in a composite auto-copied column", () => {
    const issues = validateOutputRecord(
      record(0, { ...completeOutputFields, tags: "[not json" }),
      config,
      0,
    );
    expect(issues.some((i) => i.kind === "coercion" && i.field === "tags")).toBe(true);
  });
});

describe("validateInputRecord", () => {
  it("accepts a valid input row", () => {
    const r = record(0, { id: "1", count: "3", tags: '["a"]' });
    expect(validateInputRecord(r, config, 0)).toEqual([]);
  });

  it("warns (non-blocking) on coercion failures", () => {
    const r = record(0, { id: "1", count: "abc", tags: '["a"]' });
    const issues = validateInputRecord(r, config, 2);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: "coercion",
      severity: "warning",
      field: "count",
      recordIndex: 2,
    });
  });
});
