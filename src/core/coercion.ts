import type { ValueTypeShape } from "./config/value-type";
import type { CoercedValue } from "./types/values";

export interface CoercionError {
  /** Path into a nested value (e.g. `["tags", 0]` or `["meta", "score"]`). */
  path: (string | number)[];
  message: string;
}

export type CoercionResult =
  | { ok: true; value: CoercedValue }
  | { ok: false; errors: CoercionError[] };

const BOOL_MAP: Record<string, boolean> = {
  true: true,
  false: false,
  "1": true,
  "0": false,
  yes: true,
  no: false,
  y: true,
  n: false,
};

function isEmpty(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
}

const ok = (value: CoercedValue): CoercionResult => ({ ok: true, value });
const fail = (path: (string | number)[], message: string): CoercionResult => ({
  ok: false,
  errors: [{ path, message }],
});

/**
 * Coerce a raw value (a CSV cell string, or an already-parsed JSON value for
 * nested data) into a typed {@link CoercedValue} according to the declared
 * `ValueType`. Empty cells become `null`. Composite types (`object`/`array`/
 * `map`) accept a JSON string at the top level and parse it before recursing.
 *
 * Adapter-agnostic: it knows nothing about CSV, only about raw primitives.
 */
export function coerceValue(
  type: ValueTypeShape,
  raw: unknown,
  path: (string | number)[] = [],
): CoercionResult {
  if (isEmpty(raw)) return ok(null);

  switch (type.type) {
    case "text":
      return ok(typeof raw === "string" ? raw : String(raw));

    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (Number.isNaN(n)) return fail(path, `Expected a number, got "${String(raw)}".`);
      return ok(n);
    }

    case "integer": {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (Number.isNaN(n)) return fail(path, `Expected a number, got "${String(raw)}".`);
      if (!Number.isInteger(n)) return fail(path, `Expected an integer, got "${String(raw)}".`);
      return ok(n);
    }

    case "boolean": {
      if (typeof raw === "boolean") return ok(raw);
      const key = String(raw).trim().toLowerCase();
      const mapped = BOOL_MAP[key];
      if (mapped !== undefined) return ok(mapped);
      return fail(path, `Expected a boolean, got "${String(raw)}".`);
    }

    case "date": {
      const d = raw instanceof Date ? raw : new Date(String(raw).trim());
      if (Number.isNaN(d.getTime())) return fail(path, `Expected a date, got "${String(raw)}".`);
      return ok(d);
    }

    case "enum": {
      const value = String(raw);
      const allowed = type.choices.map((c) => c.name);
      if (!allowed.includes(value)) {
        return fail(path, `Expected one of [${allowed.join(", ")}], got "${value}".`);
      }
      return ok(value);
    }

    case "object": {
      const parsed = parseStructural(raw, path);
      if (!parsed.ok) return parsed.result;
      const data = parsed.value;
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return fail(path, `Expected an object, got ${describe(data)}.`);
      }
      const out: Record<string, CoercedValue> = {};
      const errors: CoercionError[] = [];
      for (const field of type.fields) {
        const r = coerceValue(field, (data as Record<string, unknown>)[field.name], [
          ...path,
          field.name,
        ]);
        if (r.ok) out[field.name] = r.value;
        else errors.push(...r.errors);
      }
      return errors.length > 0 ? { ok: false, errors } : ok(out);
    }

    case "array": {
      const parsed = parseStructural(raw, path);
      if (!parsed.ok) return parsed.result;
      const data = parsed.value;
      if (!Array.isArray(data)) return fail(path, `Expected an array, got ${describe(data)}.`);
      const out: CoercedValue[] = [];
      const errors: CoercionError[] = [];
      data.forEach((item, i) => {
        const r = coerceValue(type.items, item, [...path, i]);
        if (r.ok) out.push(r.value);
        else errors.push(...r.errors);
      });
      return errors.length > 0 ? { ok: false, errors } : ok(out);
    }

    case "map": {
      const parsed = parseStructural(raw, path);
      if (!parsed.ok) return parsed.result;
      const data = parsed.value;
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return fail(path, `Expected a map (object), got ${describe(data)}.`);
      }
      const out: Record<string, CoercedValue> = {};
      const errors: CoercionError[] = [];
      for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
        if (type.keys?.type === "integer" && Number.isNaN(Number(key))) {
          errors.push({ path: [...path, key], message: `Map key "${key}" is not numeric.` });
          continue;
        }
        const r = coerceValue(type.values, val, [...path, key]);
        if (r.ok) out[key] = r.value;
        else errors.push(...r.errors);
      }
      return errors.length > 0 ? { ok: false, errors } : ok(out);
    }
  }
}

type StructuralParse = { ok: true; value: unknown } | { ok: false; result: CoercionResult };

/** Parse a top-level JSON string into a structural value; pass through if already parsed. */
function parseStructural(raw: unknown, path: (string | number)[]): StructuralParse {
  if (typeof raw !== "string") return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, result: fail(path, `Invalid JSON: ${raw.slice(0, 60)}`) };
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v;
}
