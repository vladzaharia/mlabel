import { z } from "zod";

/**
 * The recursive value-type system that describes how an input field's data is
 * shaped. It is intentionally adapter-agnostic: adapters hand the core raw
 * primitives (strings / JSON-ish values) and the core coerces and renders them
 * per the declared `ValueType`.
 *
 * Supported (up to ~2 levels of nesting in practice):
 *   text | number | bool | date | enum | object{fields} | array<items> | map<keyType,valueType>
 *
 * Recursion uses `z.lazy` plus an explicit `z.ZodType<Shape>` annotation, which
 * breaks TypeScript's inference cycle on the discriminated union.
 */

const scalarKinds = ["text", "number", "bool", "date"] as const;
export type ScalarKind = (typeof scalarKinds)[number];

export const EnumOption = z.object({
  value: z.string(),
  displayName: z.string().optional(),
});
export type EnumOption = z.infer<typeof EnumOption>;

// Hand-authored recursive shapes (recursive schemas need an explicit type so
// TypeScript can close the loop).
export interface ObjectFieldShape {
  name: string;
  displayName?: string;
  type: ValueTypeShape;
}

export type ValueTypeShape =
  | { type: "text" }
  | { type: "number"; format?: "integer" | "float" }
  | { type: "bool" }
  | { type: "date" }
  | { type: "enum"; options: EnumOption[] }
  | { type: "object"; fields: ObjectFieldShape[] }
  | { type: "array"; items: ValueTypeShape }
  | { type: "map"; keyType: "text" | "number"; valueType: ValueTypeShape };

export type ValueTypeKind = ValueTypeShape["type"];

export const ValueType: z.ZodType<ValueTypeShape> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("text") }),
    z.object({ type: z.literal("number"), format: z.enum(["integer", "float"]).optional() }),
    z.object({ type: z.literal("bool") }),
    z.object({ type: z.literal("date") }),
    z.object({ type: z.literal("enum"), options: z.array(EnumOption).min(1) }),
    z.object({ type: z.literal("object"), fields: z.array(ObjectField).min(1) }),
    z.object({ type: z.literal("array"), items: ValueType }),
    z.object({ type: z.literal("map"), keyType: z.enum(["text", "number"]), valueType: ValueType }),
  ]),
);

export const ObjectField: z.ZodType<ObjectFieldShape> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    displayName: z.string().optional(),
    type: ValueType,
  }),
);

/** Convenience guard used by coercion and the renderer formatter registry. */
export const isScalarKind = (kind: ValueTypeKind): kind is ScalarKind =>
  (scalarKinds as readonly string[]).includes(kind);
