import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
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
    expect(value({ type: "boolean" }, null)).toBeNull();
  });

  it("coerces text", () => {
    expect(value({ type: "text" }, "hello")).toBe("hello");
  });

  it("coerces numbers and enforces integer format", () => {
    expect(value({ type: "number" }, "3.5")).toBe(3.5);
    expect(value({ type: "integer" }, "42")).toBe(42);
    const bad = coerceValue({ type: "number" }, "abc");
    expect(bad.ok).toBe(false);
    const nonInt = coerceValue({ type: "integer" }, "1.2");
    expect(nonInt.ok).toBe(false);
  });

  it("coerces booleans from common encodings", () => {
    for (const t of ["true", "1", "yes", "Y"]) expect(value({ type: "boolean" }, t)).toBe(true);
    for (const f of ["false", "0", "no", "N"]) expect(value({ type: "boolean" }, f)).toBe(false);
    expect(coerceValue({ type: "boolean" }, "maybe").ok).toBe(false);
  });

  it("coerces dates and rejects invalid ones", () => {
    expect(value({ type: "date" }, "2026-06-04")).toBeInstanceOf(Date);
    expect(coerceValue({ type: "date" }, "not-a-date").ok).toBe(false);
  });

  it("validates enums against allowed values", () => {
    const type: ValueTypeShape = {
      type: "enum",
      choices: [{ name: "a", display: { title: "Alpha" } }, { name: "b" }],
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
          { name: "id", type: "number" },
          { name: "ok", type: "boolean" },
        ],
      },
    };
    expect(value(type, '[{"id":"1","ok":"yes"},{"id":2,"ok":false}]')).toEqual([
      { id: 1, ok: true },
      { id: 2, ok: false },
    ]);
  });

  it("coerces a map of scalars", () => {
    const type: ValueTypeShape = { type: "map", values: { type: "number" } };
    expect(value(type, '{"x":"1","y":"2"}')).toEqual({ x: 1, y: 2 });
  });

  it("coerces a map of objects (keyed table rows)", () => {
    const type: ValueTypeShape = {
      type: "map",
      values: {
        type: "object",
        fields: [{ name: "score", type: "number" }],
      },
    };
    expect(value(type, '{"alice":{"score":"9"}}')).toEqual({ alice: { score: 9 } });
  });

  it("rejects numeric-keyed maps with non-numeric keys", () => {
    const type: ValueTypeShape = {
      type: "map",
      keys: { type: "integer" },
      values: { type: "text" },
    };
    expect(coerceValue(type, '{"notnum":"v"}').ok).toBe(false);
    expect(value(type, '{"3":"v"}')).toEqual({ "3": "v" });
  });

  it("reports invalid JSON with a path", () => {
    // An array of objects has no tolerant reading — see the stringy-list block.
    const type: ValueTypeShape = {
      type: "array",
      items: { type: "object", fields: [{ name: "id", type: "text" }] },
    };
    const r = coerceValue(type, "[oops");
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

describe("coerceValue — stringy lists", () => {
  const texts: ValueTypeShape = { type: "array", items: { type: "text" } };

  it("reads a bare comma-separated list", () => {
    expect(value(texts, "a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("reads a bracketed, semicolon-separated list of numbers", () => {
    expect(value({ type: "array", items: { type: "integer" } }, "[1; 2]")).toEqual([1, 2]);
  });

  it("reads a quoted list into an enum", () => {
    const type: ValueTypeShape = {
      type: "array",
      items: { type: "enum", choices: [{ name: "red" }, { name: "green" }] },
    };
    expect(value(type, "'red', green")).toEqual(["red", "green"]);
  });

  it("still reports per-item errors with their index", () => {
    const r = coerceValue({ type: "array", items: { type: "integer" } }, "a,b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toEqual([[0], [1]]);
  });

  it("prefers a valid JSON reading over the tolerant one", () => {
    // Were the fallback to win, the comma inside the item would split it in two.
    expect(value(texts, '["a, b"]')).toEqual(["a, b"]);
  });

  it("leaves composite types strict", () => {
    const objects: ValueTypeShape = {
      type: "array",
      items: { type: "object", fields: [{ name: "id", type: "text" }] },
    };
    expect(coerceValue(objects, "a, b").ok).toBe(false);
    expect(coerceValue({ type: "map", values: { type: "text" } }, "a, b").ok).toBe(false);
    expect(coerceValue({ type: "object", fields: [{ name: "id", type: "text" }] }, "a, b").ok).toBe(
      false,
    );
  });

  // Blank items are excluded because an empty cell has always coerced to null,
  // per-item included. That predates the tolerant fallback and is unrelated.
  test.prop([fc.array(fc.string().filter((s) => s.trim() !== ""))])(
    "round-trips any JSON-encoded list of strings unchanged",
    (items) => {
      expect(value(texts, JSON.stringify(items))).toEqual(items);
    },
  );
});

describe("coerceValue — tolerant dates", () => {
  const date: ValueTypeShape = { type: "date" };
  const at = (raw: string): string => (value(date, raw) as Date).toISOString();

  it("accepts formats bare `new Date` would misread or refuse", () => {
    expect(at("2026/05/01")).toBe("2026-05-01T00:00:00.000Z");
    expect(at("25/12/2026")).toBe("2026-12-25T00:00:00.000Z");
    expect(at("20260501")).toBe("2026-05-01T00:00:00.000Z");
    expect(at("1767225600")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("anchors a date-only value to UTC, so it cannot render a day early", () => {
    expect(at("2026-05-01")).toBe("2026-05-01T00:00:00.000Z");
  });

  it("reads a zone-less timestamp as UTC rather than as the labeler's local time", () => {
    expect(at("2026-05-01 14:30:00")).toBe("2026-05-01T14:30:00.000Z");
  });

  it("passes an existing Date through untouched", () => {
    const d = new Date("2026-05-01T09:00:00Z");
    expect(value(date, d)).toBe(d);
  });
});
