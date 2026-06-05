import { describe, expect, it } from "vitest";
import { coerceValue } from "./coercion";
import type { ValueTypeShape } from "./config/value-type";

function value(type: ValueTypeShape, raw: unknown): unknown {
  const r = coerceValue(type, raw);
  if (!r.ok) throw new Error(`expected ok, got errors: ${JSON.stringify(r.errors)}`);
  return r.value;
}

describe("coerceValue — scalars", () => {
  it("returns null for empty / whitespace cells", () => {
    expect(value({ type: "text" }, "")).toBeNull();
    expect(value({ type: "number" }, "   ")).toBeNull();
    expect(value({ type: "bool" }, null)).toBeNull();
  });

  it("coerces text", () => {
    expect(value({ type: "text" }, "hello")).toBe("hello");
  });

  it("coerces numbers and enforces integer format", () => {
    expect(value({ type: "number" }, "3.5")).toBe(3.5);
    expect(value({ type: "number", format: "integer" }, "42")).toBe(42);
    const bad = coerceValue({ type: "number" }, "abc");
    expect(bad.ok).toBe(false);
    const nonInt = coerceValue({ type: "number", format: "integer" }, "1.2");
    expect(nonInt.ok).toBe(false);
  });

  it("coerces booleans from common encodings", () => {
    for (const t of ["true", "1", "yes", "Y"]) expect(value({ type: "bool" }, t)).toBe(true);
    for (const f of ["false", "0", "no", "N"]) expect(value({ type: "bool" }, f)).toBe(false);
    expect(coerceValue({ type: "bool" }, "maybe").ok).toBe(false);
  });

  it("coerces dates and rejects invalid ones", () => {
    expect(value({ type: "date" }, "2026-06-04")).toBeInstanceOf(Date);
    expect(coerceValue({ type: "date" }, "not-a-date").ok).toBe(false);
  });

  it("validates enums against allowed values", () => {
    const type: ValueTypeShape = {
      type: "enum",
      options: [{ value: "a", displayName: "Alpha" }, { value: "b" }],
    };
    expect(value(type, "a")).toBe("a");
    expect(coerceValue(type, "z").ok).toBe(false);
  });
});

describe("coerceValue — composites (JSON-encoded)", () => {
  it("coerces an array of scalars", () => {
    expect(value({ type: "array", items: { type: "number" } }, "[1, 2, 3]")).toEqual([1, 2, 3]);
  });

  it("coerces an array of objects (table data)", () => {
    const type: ValueTypeShape = {
      type: "array",
      items: {
        type: "object",
        fields: [
          { name: "id", type: { type: "number" } },
          { name: "ok", type: { type: "bool" } },
        ],
      },
    };
    expect(value(type, '[{"id":"1","ok":"yes"},{"id":2,"ok":false}]')).toEqual([
      { id: 1, ok: true },
      { id: 2, ok: false },
    ]);
  });

  it("coerces a map of scalars", () => {
    const type: ValueTypeShape = { type: "map", keyType: "text", valueType: { type: "number" } };
    expect(value(type, '{"x":"1","y":"2"}')).toEqual({ x: 1, y: 2 });
  });

  it("coerces a map of objects (keyed table rows)", () => {
    const type: ValueTypeShape = {
      type: "map",
      keyType: "text",
      valueType: {
        type: "object",
        fields: [{ name: "score", type: { type: "number" } }],
      },
    };
    expect(value(type, '{"alice":{"score":"9"}}')).toEqual({ alice: { score: 9 } });
  });

  it("rejects numeric-keyed maps with non-numeric keys", () => {
    const type: ValueTypeShape = { type: "map", keyType: "number", valueType: { type: "text" } };
    expect(coerceValue(type, '{"notnum":"v"}').ok).toBe(false);
    expect(value(type, '{"3":"v"}')).toEqual({ "3": "v" });
  });

  it("reports invalid JSON with a path", () => {
    const r = coerceValue({ type: "array", items: { type: "text" } }, "[oops");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toMatch(/Invalid JSON/);
  });

  it("reports nested coercion errors with the correct path", () => {
    const type: ValueTypeShape = { type: "array", items: { type: "number" } };
    const r = coerceValue(type, '[1, "bad", 3]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.path).toEqual([1]);
  });
});
