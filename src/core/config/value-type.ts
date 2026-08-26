import { z } from "zod";

/**
 * The value-type system: what a field's data *is*, independent of how it is
 * rendered or who provides it.
 *
 * A field **is** a type. `type` is a flat string tag and each variant carries
 * its own payload key (`items` / `fields` / `values` / `choices`), the way JSON
 * Schema and Avro do it. That gives one description for both sides of the
 * config — the input side declaring source columns and the output side
 * declaring captured ones — and it puts constraints where the type is, so
 * `minLength` can only appear on text and `min` only on a number.
 *
 * Recursion (`array.items`, `map.values`, `object.fields`) needs a hand-written
 * shape plus an explicit two-parameter `z.ZodType<S, S>` annotation to break
 * TypeScript's inference cycle. The one-parameter form silently degrades
 * `z.input<>` to `unknown`, so don't use it.
 */

// --- Presentation ----------------------------------------------------------

/** Where a field's caption sits relative to its value. */
export const TitlePosition = z.enum(["left", "above"]);
export const TextSize = z.enum(["sm", "md", "lg"]);

/**
 * Captions for one entity.
 *
 * A bare string is shorthand for `{ title }` — the overwhelmingly common case
 * — and the loader normalizes it away so nothing downstream sees two shapes.
 */
export const TextDisplay = z
  .strictObject({
    title: z
      .string()
      .meta({ description: "The caption shown in place of the machine name." })
      .optional(),
    /** Rendered under the caption. */
    description: z.string().meta({ description: "Shown under the caption." }).optional(),
    /** Rendered in the ⓘ popover beside the caption. */
    help: z.string().meta({ description: "Shown in the ⓘ popover beside the caption." }).optional(),
  })
  .meta({
    id: "TextDisplay",
    title: "Text display",
    description:
      "Captions for one entity. A bare string is shorthand for `{ title }`, which is how most display blocks are written.",
  });
export type TextDisplay = z.infer<typeof TextDisplay>;

/**
 * Captions plus layout. Only fields get the layout keys; choices, cards and
 * table columns take `TextDisplay`, so a meaningless `textSize` on a choice is
 * rejected rather than silently ignored.
 */
export const FieldDisplay = TextDisplay.extend({
  titlePosition: TitlePosition.meta({
    description: "Where the caption sits relative to the value. Defaults to `left`.",
  }).optional(),
  textSize: TextSize.meta({
    description: "Size of the rendered value. Defaults to `md`.",
  }).optional(),
}).meta({
  id: "FieldDisplay",
  title: "Field display",
  description:
    "Captions plus layout. Only fields take the layout keys — choices, cards and table columns take a plain text display.",
});
export type FieldDisplay = z.infer<typeof FieldDisplay>;

/**
 * A config may write `"display": "Model score"` instead of
 * `{ "title": "Model score" }` — 85% of display blocks carry only a title.
 *
 * The shorthand is expanded by `normalizeDisplayShorthand` in the loader,
 * *before* validation, rather than by a Zod `.transform()`. A transform would
 * make the schema's input and output types differ, which the recursive
 * `z.ZodType<S, S>` annotations can't express — and it would leave every
 * consumer facing two shapes. Pre-normalizing means the schema, and everything
 * downstream of it, only ever sees the object form.
 */

// --- Styling ---------------------------------------------------------------

/**
 * The closed style vocabulary, shared by display rules and per-choice
 * selected-state styling. Semantic rather than colours: every tone maps to a
 * contrast-audited token pair, so the CI gate keeps covering them.
 */
export const Tone = z.enum(["muted", "info", "success", "warning", "danger", "accent"]);
export type Tone = z.infer<typeof Tone>;

export const Style = z
  .strictObject({
    tone: Tone.meta({
      description:
        "Semantic tone. Each maps to a contrast-audited token pair rather than a fixed colour, so both themes stay legible.",
    }).optional(),
    /** Short explanation shown beside the styled value. */
    note: z
      .string()
      .meta({ description: "Short explanation shown beside the styled value." })
      .optional(),
  })
  .meta({ id: "Style", title: "Style" });
export type Style = z.infer<typeof Style>;

// --- Choices ---------------------------------------------------------------

/**
 * One option of an `enum`. `name` is the literal string written to the data
 * file — the same sense as a field's `name`, which is its column header.
 */
export const Choice = z
  .strictObject({
    // Trimmed and non-empty: an empty choice coerces back to null on re-read,
    // making it both unselectable and impossible to round-trip.
    name: z.string().trim().min(1).meta({
      description: "The literal string written to the data file when this choice is selected.",
    }),
    display: TextDisplay.optional(),
    /** Selects this choice while its field has focus. Unique within the field. */
    shortcut: z
      .string()
      .meta({
        description:
          "Chord that picks this choice. Fires app-wide, not only while the field has focus, so it shares one namespace with every other shortcut in the config.",
      })
      .optional(),
    /** Applied to the widget while this choice is the selected one. */
    selectedStyle: Style.meta({
      description: "Applied to the widget while this choice is the selected one.",
    }).optional(),
  })
  .meta({
    id: "Choice",
    title: "Choice",
    description: "One option of an `enum`.",
  });
export type Choice = z.infer<typeof Choice>;

// --- Composite table columns ----------------------------------------------

/**
 * How an object's fields group into displayed table columns.
 *
 * Lives on the `object` type, beside the `fields` its columns name — so it
 * nests to any depth, covers `map<_, object>` as well as arrays, and is
 * structurally impossible to attach to a non-object.
 */
export const TableColumn = z
  .strictObject({
    name: z.string().min(1).meta({ description: "The column heading." }),
    /** Object field names combined into this one column. */
    use: z
      .array(z.string().min(1))
      .min(1)
      .meta({ description: "Object field names combined into this one column." }),
    /**
     * How multiple values share the cell; defaults to `chips` at render time.
     *
     * Deliberately not a Zod `.default()`: this type sits inside the recursive
     * `ValueType`, and a default would make the schema's input and output types
     * differ, which `z.ZodType<S, S>` can't express.
     */
    layout: z
      .enum(["chips", "stack", "inline"])
      .meta({
        description: "How multiple values share the cell. Defaults to `chips`.",
      })
      .optional(),
    display: TextDisplay.optional(),
  })
  .meta({
    id: "TableColumn",
    title: "Table column",
    description: "One displayed column, combining one or more of the object's own fields.",
  });
export type TableColumn = z.infer<typeof TableColumn>;

/** How a composite column renders when the author doesn't say. */
export const DEFAULT_COLUMN_LAYOUT = "chips" as const;

export const TableView = z
  .strictObject({
    columns: z
      .array(TableColumn)
      .min(1)
      .meta({ description: "The displayed columns, left to right." }),
  })
  .meta({
    id: "TableView",
    title: "Table view",
    description:
      "How an object's fields group into displayed columns. Lives on the `object` type beside the `fields` its columns name, so it nests to any depth and covers `map<_, object>` as well as arrays.",
  });
export type TableView = z.infer<typeof TableView>;

// --- Type variants ---------------------------------------------------------

/**
 * Widgets legal for each type, declared per variant so the pairing is
 * *structural*: the emitted JSON Schema offers only the widgets legal for the
 * type an author wrote, and squiggles the rest. First entry is the default.
 *
 * `object` and `map` have none — they are display-only, and an output field of
 * that type has no way to be filled by a user.
 */
export const WIDGETS_BY_TYPE = {
  text: ["text", "textarea"],
  integer: ["number", "slider"],
  number: ["number", "slider"],
  boolean: ["checkbox"],
  date: ["date"],
  enum: ["select", "radio"],
  array: ["checkboxes"],
  object: [],
  map: [],
} as const satisfies Record<string, readonly string[]>;

export type ValueTypeKind = keyof typeof WIDGETS_BY_TYPE;
export type Widget = (typeof WIDGETS_BY_TYPE)[ValueTypeKind][number];

/** The widget a type renders with when the author doesn't name one. */
export function defaultWidget(kind: ValueTypeKind): Widget | undefined {
  return WIDGETS_BY_TYPE[kind][0];
}

// Hand-authored shapes: recursive schemas need an explicit type so TypeScript
// can close the loop. Payload keys are declared once and shared by both the
// anonymous (`ValueType`) and named (`NestedField`) forms.
interface TypePayloads {
  text: { minLength?: number; maxLength?: number; pattern?: string };
  integer: { min?: number; max?: number; step?: number };
  number: { min?: number; max?: number; step?: number };
  boolean: Record<never, never>;
  date: Record<never, never>;
  enum: { choices: Choice[] };
  object: { fields: NestedFieldShape[]; table?: TableView };
  array: { items: ValueTypeShape };
  map: { keys?: ValueTypeShape; values: ValueTypeShape };
}

type Tagged<Extra> = {
  [K in ValueTypeKind]: { type: K } & TypePayloads[K] & Extra;
}[ValueTypeKind];

export type ValueTypeShape = Tagged<Record<never, never>>;
export type NestedFieldShape = Tagged<{ name: string; display?: TextDisplay }>;

/** Keys that differ per variant, e.g. the widget enum legal for that type. */
type PerKind = (kind: ValueTypeKind) => z.ZodRawShape;

/**
 * The nine type variants, parameterised by whatever extra keys the node
 * carries. Written once and called for every position a type can appear in.
 *
 * `perKind` lets a caller add keys whose *shape* depends on the variant — the
 * output side uses it to give each type only the widgets legal for it, which is
 * what makes `widget: "slider"` on a text field a structural error rather than
 * something a hand-written check has to catch.
 */
export function typeVariants<S extends z.ZodRawShape>(shared: S, perKind: PerKind = () => ({})) {
  return [
    z.strictObject({
      ...shared,
      ...perKind("text"),
      type: z.literal("text").meta({ description: "A string." }),
      minLength: z
        .number()
        .int()
        .nonnegative()
        .meta({ description: "Shortest accepted value, in characters." })
        .optional(),
      maxLength: z
        .number()
        .int()
        .nonnegative()
        .meta({ description: "Longest accepted value, in characters." })
        .optional(),
      pattern: z
        .string()
        .meta({
          description:
            "JavaScript regular expression the value must match. Compiled when the config loads, so a malformed pattern fails at load rather than at render.",
        })
        .optional(),
    }),
    z.strictObject({
      ...shared,
      ...perKind("integer"),
      type: z.literal("integer").meta({ description: "A whole number." }),
      min: z.number().meta({ description: "Smallest accepted value, inclusive." }).optional(),
      max: z.number().meta({ description: "Largest accepted value, inclusive." }).optional(),
      // A widget hint only, never a validity constraint: three slider clicks
      // legitimately produce 0.30000000000000004.
      step: z
        .number()
        .positive()
        .meta({
          description:
            "Increment for the number and slider widgets. A hint only, never a validity constraint — three slider clicks legitimately produce 0.30000000000000004.",
        })
        .optional(),
    }),
    z.strictObject({
      ...shared,
      ...perKind("number"),
      type: z.literal("number").meta({ description: "A number, whole or fractional." }),
      min: z.number().meta({ description: "Smallest accepted value, inclusive." }).optional(),
      max: z.number().meta({ description: "Largest accepted value, inclusive." }).optional(),
      step: z
        .number()
        .positive()
        .meta({
          description:
            "Increment for the number and slider widgets. A hint only, never a validity constraint.",
        })
        .optional(),
    }),
    z.strictObject({
      ...shared,
      ...perKind("boolean"),
      type: z.literal("boolean").meta({ description: "true / false." }),
    }),
    z.strictObject({
      ...shared,
      ...perKind("date"),
      type: z.literal("date").meta({ description: "A date; ISO-8601 on the wire." }),
    }),
    z.strictObject({
      ...shared,
      ...perKind("enum"),
      type: z.literal("enum").meta({ description: "One of a fixed set of `choices`." }),
      choices: z
        .array(Choice)
        .min(1)
        .meta({ description: "The permitted values, in the order they are offered." }),
    }),
    z.strictObject({
      ...shared,
      ...perKind("object"),
      type: z.literal("object").meta({ description: "A record with named `fields`." }),
      get fields() {
        return z.array(NestedField).min(1).meta({
          description:
            "The object's own named members. Unlike a column name, these are JSON keys from the source payload, so colons, slashes and unicode are all allowed.",
        });
      },
      table: TableView.optional(),
    }),
    z.strictObject({
      ...shared,
      ...perKind("array"),
      type: z.literal("array").meta({ description: "A list of `items`." }),
      get items() {
        return ValueType.meta({
          description:
            "The type of every element. An `array` of `enum` is how a multi-select is declared.",
        });
      },
    }),
    z.strictObject({
      ...shared,
      ...perKind("map"),
      type: z.literal("map").meta({ description: "A dictionary of `keys` → `values`." }),
      get keys() {
        return ValueType.meta({
          description: "The type of each key. Defaults to text when omitted.",
        }).optional();
      },
      get values() {
        return ValueType.meta({ description: "The type of each value." });
      },
    }),
  ] as const;
}

/** A type with no name — `array.items`, `map.values`, `map.keys`. */
export const ValueType: z.ZodType<ValueTypeShape, ValueTypeShape> = z
  .discriminatedUnion("type", typeVariants({}))
  .meta({ id: "ValueType", title: "Value type" });

/**
 * A named type inside an `object`.
 *
 * Names here are JSON keys from source data rather than column headers, so they
 * are deliberately unconstrained — real payloads use colons, slashes and unicode.
 */
export const NestedField: z.ZodType<NestedFieldShape, NestedFieldShape> = z
  .discriminatedUnion(
    "type",
    typeVariants({
      name: z.string().min(1).meta({
        description:
          "The key this member has in the source payload. Deliberately unconstrained, unlike a column name — real payloads use colons, slashes and unicode.",
      }),
      display: TextDisplay.optional(),
    }),
  )
  .meta({
    id: "NestedField",
    title: "Nested field",
    description: "A named member inside an `object`.",
  });

/**
 * The caption to show for something, falling back to its machine name.
 *
 * One helper rather than `display?.title ?? name` scattered around — that
 * fallback appeared eight times in the renderer before, and each copy was a
 * chance to get it subtly different.
 */
export const titleOf = (name: string, display?: TextDisplay): string => display?.title ?? name;

/** Convenience guard used by coercion and the renderer's formatter dispatch. */
const SCALAR_KINDS = ["text", "integer", "number", "boolean", "date", "enum"] as const;
export type ScalarKind = (typeof SCALAR_KINDS)[number];
export const isScalarKind = (kind: ValueTypeKind): kind is ScalarKind =>
  (SCALAR_KINDS as readonly string[]).includes(kind);
