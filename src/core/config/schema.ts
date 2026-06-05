import { z } from "zod";
import { EnumOption, ValueType } from "./value-type";

/**
 * The MLabel configuration schema. A single `.jsonc` file fully describes what
 * is displayed (input) and what is captured (output). Sensible defaults keep
 * authored configs small.
 */

const LabelPosition = z.enum(["left", "above"]).default("left");
const TextSize = z.enum(["sm", "md", "lg"]).default("md");
const Identifier = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_.\- ]+$/, "must match a CSV column / output column name");

/** An input field: a named, typed column rendered read-only from the source data. */
export const InputField = z.object({
  name: Identifier,
  type: ValueType,
  displayName: z.string().optional(),
  description: z.string().optional(),
  help: z.string().optional(),
  labelPosition: LabelPosition,
  textSize: TextSize,
  /** When true, this field's value populates the top app-bar title. */
  title: z.boolean().default(false),
});
export type InputField = z.infer<typeof InputField>;

export const OUTPUT_CONTROLS = [
  "text",
  "textarea",
  "number",
  "checkbox",
  "date",
  "radio",
  "select",
  "slider",
  "hidden",
] as const;
export type OutputControl = (typeof OUTPUT_CONTROLS)[number];

/** An output field: either captured from the user via a control, or auto-copied. */
export const OutputField = z
  .object({
    name: Identifier,
    control: z.enum(OUTPUT_CONTROLS),
    displayName: z.string().optional(),
    description: z.string().optional(),
    help: z.string().optional(),
    labelPosition: LabelPosition,
    textSize: TextSize,
    /** Required-by-default: a row is "complete" when all required fields are valid. */
    required: z.boolean().default(true),
    /** Choices for `radio` / `select`. */
    options: z.array(EnumOption).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    regex: z.string().optional(),
  })
  .check((ctx) => {
    const f = ctx.value;
    if (
      (f.control === "radio" || f.control === "select") &&
      (!f.options || f.options.length === 0)
    ) {
      ctx.issues.push({
        code: "custom",
        input: f,
        path: ["options"],
        message: `Output field "${f.name}" with control "${f.control}" requires non-empty options.`,
      });
    }
    if (f.regex) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(f.regex);
      } catch {
        ctx.issues.push({
          code: "custom",
          input: f,
          path: ["regex"],
          message: `Invalid regex for "${f.name}".`,
        });
      }
    }
  });
export type OutputField = z.infer<typeof OutputField>;

/** A row within a category card: fields flow with flex-wrap to a column count. */
export const GridRow = z.object({
  /** Minimum columns; drives each item's flex-basis (defaults to field count). */
  columns: z.number().int().positive().optional(),
  fields: z.array(Identifier).min(1),
});
export type GridRow = z.infer<typeof GridRow>;

/**
 * A category card grouping fields under a heading. Used identically for input
 * (read-only value cards) and output (interactive widget cards) — the two sides
 * share this one configuration shape.
 */
export const Category = z.object({
  id: Identifier,
  displayName: z.string().min(1),
  description: z.string().optional(),
  help: z.string().optional(),
  rows: z.array(GridRow).min(1),
});
export type Category = z.infer<typeof Category>;

const AdapterRef = z.object({
  adapterId: z.string().min(1).default("csv"),
  /** Opaque, adapter-owned options (e.g. delimiter). The core never reads this. */
  adapterConfig: z.unknown().optional(),
});

export const AppConfig = z
  .object({
    $schema: z.string().optional(),
    input: AdapterRef.extend({
      fields: z.array(InputField).min(1),
      categories: z.array(Category).min(1),
    }),
    output: AdapterRef.extend({
      fields: z.array(OutputField).min(1),
      /** Optional category cards. When omitted, every visible output field is
       *  shown in a single implicit card, one per row. */
      categories: z.array(Category).optional(),
    }),
    ui: z
      .object({
        appTitle: z.string().optional(),
      })
      .optional(),
    /**
     * Network policy. The app is local-first; the only network it ever performs
     * is the GitHub-Releases update check. Set `updateChecks: false` to forbid
     * all network calls. Absent or `true` ⇒ update checks run.
     */
    network: z.object({ updateChecks: z.boolean().default(true) }).default({ updateChecks: true }),
  })
  .check((ctx) => {
    const cfg = ctx.value;
    const inputNames = new Set(cfg.input.fields.map((f) => f.name));

    // Unique input field names.
    assertUnique(
      ctx,
      cfg.input.fields.map((f) => f.name),
      ["input", "fields"],
      "input field",
    );
    // Unique output field names.
    assertUnique(
      ctx,
      cfg.output.fields.map((f) => f.name),
      ["output", "fields"],
      "output field",
    );

    // At most one title field.
    const titleCount = cfg.input.fields.filter((f) => f.title).length;
    if (titleCount > 1) {
      ctx.issues.push({
        code: "custom",
        input: cfg,
        path: ["input", "fields"],
        message: `Only one input field may be marked as the title (found ${String(titleCount)}).`,
      });
    }

    const outputNames = new Set(cfg.output.fields.map((f) => f.name));
    validateCategoryRefs(ctx, cfg.input.categories, inputNames, ["input", "categories"], "input");
    if (cfg.output.categories) {
      validateCategoryRefs(
        ctx,
        cfg.output.categories,
        outputNames,
        ["output", "categories"],
        "output",
      );
    }
  });

export type AppConfig = z.infer<typeof AppConfig>;

function validateCategoryRefs(
  ctx: { value: unknown; issues: z.core.$ZodRawIssue[] },
  categories: Category[],
  known: ReadonlySet<string>,
  basePath: (string | number)[],
  side: string,
): void {
  categories.forEach((cat, ci) => {
    cat.rows.forEach((row, ri) => {
      row.fields.forEach((name, fi) => {
        if (!known.has(name)) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: [...basePath, ci, "rows", ri, "fields", fi],
            message: `Category "${cat.id}" references unknown ${side} field "${name}".`,
          });
        }
      });
    });
  });
}

function assertUnique(
  ctx: { value: unknown; issues: z.core.$ZodRawIssue[] },
  names: string[],
  path: (string | number)[],
  label: string,
): void {
  const seen = new Set<string>();
  names.forEach((name, i) => {
    if (seen.has(name)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: [...path, i, "name"],
        message: `Duplicate ${label} name "${name}".`,
      });
    }
    seen.add(name);
  });
}
