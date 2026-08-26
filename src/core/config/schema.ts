import { z } from "zod";
import { isReservedChord } from "../shortcuts";
import {
  Choice,
  FieldDisplay,
  Style,
  TextDisplay,
  typeVariants,
  TableView,
  WIDGETS_BY_TYPE,
  type ValueTypeKind,
} from "./value-type";

/**
 * The MLabel configuration schema. A single `.jsonc` file fully describes what
 * is displayed (input) and what is captured (output).
 *
 * Two properties are worth knowing before editing this file:
 *
 * 1. **Every object is strict.** An unrecognized key is an error, not a
 *    silently-dropped one — a misspelled `network.updateChecks` used to leave
 *    the permissive default in place, so a config that read as opting out of
 *    all network still checked GitHub. `adapterConfig` is the one exception.
 *
 * 2. **A field is a type.** Input and output fields share one shape: a flat
 *    `type` tag plus that type's payload and constraints. The output side adds
 *    `widget` (how it renders) and `fill` (who provides the value), which are
 *    orthogonal to each other and to the type.
 */

/**
 * A field or card name.
 *
 * Deliberately excludes `.` `[` `]` `*` — those are reserved for a future rule
 * path grammar (`checks[*].toxic`) and would be ambiguous in the dotted issue
 * paths the loader reports. Leading/trailing whitespace is excluded too: CSV
 * headers are trimmed on read but written verbatim, so a padded name fails to
 * round-trip through Prepare's join.
 */
const Identifier = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9_-][A-Za-z0-9_ -]*[A-Za-z0-9_-]$|^[A-Za-z0-9_-]$/,
    "must be a column name: letters, digits, _ or -, with optional inner spaces",
  );

/** A keyboard chord, e.g. `"p"` or `"mod+s"` (mod = Cmd on macOS, Ctrl elsewhere). */
const Chord = z
  .string()
  .regex(/^(?:(?:mod|ctrl|alt|shift|meta)\+)*[A-Za-z0-9]$/, 'e.g. "p" or "mod+s"');

// --- Who fills a field -----------------------------------------------------

/**
 * Where an output field's value comes from — orthogonal to how it renders.
 *
 * This replaces the old `control: "hidden"`, which conflated the two, and the
 * implicit "output name matches an input name ⇒ copy it" convention. Being
 * explicit means a copied column can be renamed, and a captured field may
 * safely share a name with an input column.
 */
export const Fill = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z
        .literal("user")
        .meta({ description: "The labeler answers this field on every record." }),
    }),
    z.strictObject({
      kind: z.literal("copy").meta({
        description: "Carried over from an input column. Renders no widget.",
      }),
      /** Input field to copy from; defaults to this field's own name. */
      from: Identifier.meta({
        description:
          "Input field to copy from. Defaults to this field's own name; naming one explicitly is how a copied column gets renamed on the way out. Its type must match this field's type.",
      }).optional(),
    }),
    z.strictObject({
      kind: z.literal("session").meta({
        description:
          "The labeler answers this once, on the setup step, and the answer is written to every exported row.",
      }),
    }),
    z.strictObject({
      kind: z.literal("timestamp").meta({
        description:
          "Stamped by the app when the record becomes complete, and again on every later edit. Renders no widget.",
      }),
    }),
  ])
  .meta({
    id: "Fill",
    title: "Fill",
    description:
      "Where an output field's value comes from — orthogonal to how it renders. Only `user` and `session` fields show a widget.",
  });
export type Fill = z.infer<typeof Fill>;

export type FillKind = Fill["kind"];

/** Only these render a widget; `copy` and `timestamp` are filled without asking. */
const INTERACTIVE_FILLS: ReadonlySet<FillKind> = new Set<FillKind>(["user", "session"]);

export const isInteractiveFill = (kind: FillKind): boolean => INTERACTIVE_FILLS.has(kind);

// --- Fields ----------------------------------------------------------------

/** The source column this field reads, or the output column it writes. */
const FieldName = Identifier.meta({
  description:
    "The column name in the data file. Letters, digits, `_` and `-`, with optional inner spaces; `.` `[` `]` `*` and edge whitespace are excluded.",
});

export const InputField = z
  .discriminatedUnion("type", typeVariants({ name: FieldName, display: FieldDisplay.optional() }))
  .meta({
    id: "InputField",
    title: "Input field",
    description: "One source column, read from the input file and shown read-only.",
  });
export type InputField = z.infer<typeof InputField>;

/** The widget keys legal for one type — empty for types that render no widget. */
function widgetFor(kind: ValueTypeKind): z.ZodRawShape {
  const legal: readonly string[] = WIDGETS_BY_TYPE[kind];
  if (legal.length === 0) return {};
  return {
    widget: z
      .enum([...legal] as [string, ...string[]])
      .meta({
        description: `How the field renders. Defaults to \`${legal[0]}\`. Only a field a person fills may name a widget.`,
      })
      .optional(),
  };
}

export const OutputField = z
  .discriminatedUnion(
    "type",
    typeVariants(
      {
        name: FieldName,
        display: FieldDisplay.optional(),
        fill: Fill.meta({
          description: 'Where this field\'s value comes from. Defaults to `{ "kind": "user" }`.',
        }).optional(),
        /**
         * Defaults by fill: user- and session-filled fields are required,
         * copied and timestamped ones are not. Resolved by `isRequired`.
         */
        required: z
          .boolean()
          .meta({
            description:
              "Whether a record counts as complete without this field. Defaults by fill: something a person is asked for is required, something the app derives is not.",
          })
          .optional(),
        /** Moves focus to this field's widget. Unique across the config. */
        shortcut: Chord.meta({
          description:
            'Chord that moves focus to this field\'s widget, e.g. `"mod+1"`. Unique across the whole config, and not one of the chords the app or OS reserves.',
        }).optional(),
      },
      widgetFor,
    ),
  )
  .meta({
    id: "OutputField",
    title: "Output field",
    description:
      "One column written to the output file — captured from the labeler, copied from the input, or derived by the app.",
  });
export type OutputField = z.infer<typeof OutputField>;

// --- Layout ----------------------------------------------------------------

export const CardRow = z
  .strictObject({
    /** Minimum columns before wrapping; defaults to the number of fields in the row. */
    perRow: z
      .number()
      .int()
      .positive()
      .meta({
        description: "Columns to fit before wrapping. Defaults to the number of fields in the row.",
      })
      .optional(),
    /** Field names to render, in order. */
    use: z
      .array(Identifier)
      .min(1)
      .meta({ description: "Field names to render in this row, in order." }),
  })
  .meta({ id: "CardRow", title: "Card row" });
export type CardRow = z.infer<typeof CardRow>;

/**
 * A card grouping fields under a heading. The same shape drives read-only input
 * cards and interactive output cards.
 */
export const Card = z
  .strictObject({
    name: Identifier.meta({ description: "Identifies the card; must be unique per side." }),
    display: TextDisplay.optional(),
    /**
     * `session` cards render on the setup step rather than per record. Listing a
     * session field in a `record` card would leave a hole in the grid.
     */
    scope: z
      .enum(["record", "session"])
      .meta({
        description:
          "`session` cards render on the setup step rather than once per record. Defaults to `record`.",
      })
      .optional(),
    rows: z.array(CardRow).min(1).meta({ description: "The card's rows, rendered top to bottom." }),
  })
  .meta({
    id: "Card",
    title: "Card",
    description:
      "A card grouping fields under a heading. The same shape drives read-only input cards and interactive output cards. Omit `cards` entirely for one implicit card holding every field, one per row.",
  });
export type Card = z.infer<typeof Card>;

// --- Display rules ---------------------------------------------------------

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/** The input field a condition reads. */
const TestedField = Identifier.meta({
  description: "The input field whose value is tested.",
});

/** Prose for each operator, so hovering `op` explains the choice. */
const OPS: Record<string, string> = {
  eq: "True when the values are equal.",
  ne: "True when the values differ.",
  gt: "True when the field is greater than the comparand.",
  gte: "True when the field is greater than or equal to the comparand.",
  lt: "True when the field is less than the comparand.",
  lte: "True when the field is less than or equal to the comparand.",
  in: "True when the field matches one of the listed values.",
  notIn: "True when the field matches none of the listed values.",
  matches: "True when the field matches the regular expression.",
  empty: "True when the field is null, an empty string, or an empty list.",
  notEmpty: "True when the field holds anything at all.",
};

/** Comparison against either a literal or another field — exactly one. */
const comparison = <T extends string>(op: T, value: z.ZodType) =>
  z.strictObject({
    op: z.literal(op).meta({ description: OPS[op] }),
    field: TestedField,
    value: value
      .meta({ description: "The literal to compare against. Give this or `otherField`, not both." })
      .optional(),
    otherField: Identifier.meta({
      description:
        "Another input field to compare against, for rules that relate two columns. Give this or `value`, not both.",
    }).optional(),
  });

/**
 * A rule's trigger. A discriminated union on `op` from the start, so composition
 * (`allOf` / `anyOf` / `not`, which carry no `field`) can be added later without
 * breaking existing configs.
 */
export const Condition = z
  .discriminatedUnion("op", [
    comparison("eq", Scalar),
    comparison("ne", Scalar),
    comparison("gt", z.number()),
    comparison("gte", z.number()),
    comparison("lt", z.number()),
    comparison("lte", z.number()),
    z.strictObject({
      op: z.literal("in").meta({ description: OPS["in"] }),
      field: TestedField,
      value: z.array(Scalar).min(1).meta({ description: "The values to match against." }),
    }),
    z.strictObject({
      op: z.literal("notIn").meta({ description: OPS["notIn"] }),
      field: TestedField,
      value: z.array(Scalar).min(1).meta({ description: "The values to match against." }),
    }),
    z.strictObject({
      op: z.literal("matches").meta({ description: OPS["matches"] }),
      field: TestedField,
      pattern: z.string().min(1).meta({
        description:
          "JavaScript regular expression, tested against the value's string form. Compiled when the config loads.",
      }),
    }),
    z.strictObject({
      op: z.literal("empty").meta({ description: OPS["empty"] }),
      field: TestedField,
    }),
    z.strictObject({
      op: z.literal("notEmpty").meta({ description: OPS["notEmpty"] }),
      field: TestedField,
    }),
  ])
  .meta({
    id: "Condition",
    title: "Condition",
    description:
      "A rule's trigger, evaluated over one record's input values. Never throws: a condition pointed at a missing or wrongly-typed value simply does not fire.",
  });
export type Condition = z.infer<typeof Condition>;

/**
 * A purely visual rule over displayed input values.
 *
 * Rules never affect what is exported. That guarantee is structural: they are
 * evaluated by `decorations.ts`, which nothing on the export path imports.
 */
export const DisplayRule = z
  .strictObject({
    name: Identifier.meta({
      description: "Identifies the rule; shown in diagnostics and used as a stable render key.",
    }),
    when: Condition.meta({ description: "The condition that fires this rule." }),
    /** Fields to style. Defaults to the field the condition tests. */
    appliesTo: z
      .array(Identifier)
      .min(1)
      .meta({
        description:
          "Fields to style when the rule fires. Defaults to the field the condition tests, which is what you want for a single-field rule and never what you want when comparing two.",
      })
      .optional(),
    style: Style.meta({ description: "How the matched fields are styled." }),
  })
  .meta({
    id: "DisplayRule",
    title: "Display rule",
    description:
      "A purely visual rule over displayed input values. Rules never affect what is exported — that guarantee is structural, since the module evaluating them is never imported on the export path.",
  });
export type DisplayRule = z.infer<typeof DisplayRule>;

// --- Top level -------------------------------------------------------------

const AdapterRef = {
  adapterId: z.string().min(1).default("csv").meta({
    description:
      "Which format adapter handles this side. `csv` is the only one built in; it also reads `.tsv`.",
  }),
  /**
   * Opaque, adapter-owned options (e.g. delimiter). The core never reads this,
   * so it is the one place unknown keys survive — but it must still be an
   * object, since no adapter can do anything with a bare scalar.
   */
  adapterConfig: z
    .looseObject({})
    .meta({
      description:
        "Opaque, adapter-owned options — for CSV, `delimiter` and `quoteChar` on input, `delimiter` and `newline` on output. The core never reads this, so it is the one object in the config where unknown keys are allowed.",
    })
    .optional(),
};

/** The config shape this build reads. See `loadConfig` for the version gate. */
export const CONFIG_VERSION = 2;

export const AppConfig = z
  .strictObject({
    $schema: z
      .string()
      .meta({
        description:
          "Path or URL to this JSON Schema, for editor autocomplete. Use `https://mlabel.vlad.gg/mlabel.schema.json` for a standalone config.",
      })
      .optional(),
    version: z.literal(CONFIG_VERSION).meta({
      description:
        "Config format version. This build reads version 2 only; a config with no `version`, or a different one, is rejected with a single clear message rather than a cascade of shape errors.",
    }),

    ui: z
      .strictObject({
        /** A literal title, or the input field whose value becomes the title. */
        appTitle: z
          .union([
            z.string(),
            z.strictObject({
              field: Identifier.meta({
                description:
                  "Input field whose value becomes the window title, so the title tracks the record on screen.",
              }),
            }),
          ])
          .meta({
            description:
              'The window title: a literal string, or `{ "field": "…" }` to use the value of an input field, which changes per record.',
          })
          .optional(),
      })
      .meta({ description: "Chrome-level presentation." })
      .optional(),

    /**
     * Network policy. The app is local-first; the only network it ever performs
     * is the GitHub-Releases update check. Set `updateChecks: false` to forbid
     * all network calls. Absent or `true` ⇒ update checks run.
     */
    network: z
      .strictObject({
        updateChecks: z.boolean().default(true).meta({
          description:
            "Whether to check GitHub Releases for updates. `false` forbids every network call the app could make. Absent or `true` means checks run.",
        }),
      })
      .default({ updateChecks: true })
      .meta({
        description:
          "Network policy. The update check is the only remote request this app ever performs, and it is opt-out.",
      }),

    input: z
      .strictObject({
        ...AdapterRef,
        fields: z
          .array(InputField)
          .min(1)
          .meta({ description: "The source columns to read and show read-only." }),
        rules: z
          .array(DisplayRule)
          .meta({
            description:
              "Purely visual rules over displayed input values. A rule can never change what is exported.",
          })
          .optional(),
        /** Omit for one implicit card holding every field, one per row. */
        cards: z
          .array(Card)
          .meta({
            description: "Layout. Omit for one implicit card holding every field, one per row.",
          })
          .optional(),
      })
      .meta({ description: "What is read from the source file and shown read-only." }),

    output: z
      .strictObject({
        ...AdapterRef,
        fields: z
          .array(OutputField)
          .min(1)
          .meta({ description: "The columns written to the output file." }),
        cards: z
          .array(Card)
          .meta({
            description: "Layout. Omit for one implicit card holding every field, one per row.",
          })
          .optional(),
      })
      .meta({ description: "What the labeler captures, or the app fills in." }),
  })
  .check((ctx) => validateConfig(ctx, ctx.value));

export type AppConfig = z.infer<typeof AppConfig>;

// --- Cross-field validation ------------------------------------------------

type CheckCtx = { value: unknown; issues: z.core.$ZodRawIssue[] };

/**
 * Record a config problem.
 *
 * `continue: true` is load-bearing and easy to lose: without it Zod treats a
 * custom issue as fatal and abandons every later check, so one bad field would
 * hide all the duplicate-name and dangling-reference diagnostics behind it.
 */
function issue(ctx: CheckCtx, input: unknown, path: (string | number)[], message: string): void {
  ctx.issues.push({ code: "custom", input, path, message, continue: true });
}

function assertUnique(
  ctx: CheckCtx,
  names: readonly string[],
  path: (string | number)[],
  label: string,
): void {
  const seen = new Set<string>();
  names.forEach((name, i) => {
    if (seen.has(name))
      issue(ctx, ctx.value, [...path, i, "name"], `Duplicate ${label} "${name}".`);
    seen.add(name);
  });
}

/** Every `use` in every card row must name a declared field. */
function validateCards(
  ctx: CheckCtx,
  cards: readonly Card[] | undefined,
  known: ReadonlySet<string>,
  basePath: (string | number)[],
  side: string,
): void {
  cards?.forEach((card, ci) => {
    card.rows.forEach((row, ri) => {
      row.use.forEach((name, ui) => {
        if (!known.has(name)) {
          issue(
            ctx,
            ctx.value,
            [...basePath, ci, "rows", ri, "use", ui],
            `Card "${card.name}" references unknown ${side} field "${name}".`,
          );
        }
      });
    });
  });
}

/**
 * Table columns address their own object's fields, not the top-level ones.
 *
 * Walks the whole type tree because the tables that matter are nested: a table
 * is how an `array<object>` or `map<_, object>` renders, so the object carrying
 * the column list is almost never the field itself.
 */
function validateTables(
  ctx: CheckCtx,
  node: { type: string } & Record<string, unknown>,
  path: (string | number)[],
): void {
  switch (node["type"]) {
    case "object": {
      const fields = node["fields"] as { name: string; type: string }[];
      const known = new Set(fields.map((f) => f.name));
      const table = node["table"] as TableView | undefined;
      table?.columns.forEach((column, ci) => {
        column.use.forEach((name, ui) => {
          if (!known.has(name)) {
            issue(
              ctx,
              ctx.value,
              [...path, "table", "columns", ci, "use", ui],
              `Table column "${column.name}" references unknown object field "${name}".`,
            );
          }
        });
      });
      fields.forEach((f, i) =>
        validateTables(ctx, f as unknown as { type: string } & Record<string, unknown>, [
          ...path,
          "fields",
          i,
        ]),
      );
      return;
    }
    case "array":
      validateTables(ctx, node["items"] as { type: string } & Record<string, unknown>, [
        ...path,
        "items",
      ]);
      return;
    case "map":
      validateTables(ctx, node["values"] as { type: string } & Record<string, unknown>, [
        ...path,
        "values",
      ]);
      return;
    default:
      return;
  }
}

function collectShortcuts(
  ctx: CheckCtx,
  fields: readonly OutputField[],
  basePath: (string | number)[],
): void {
  // One namespace for every chord the config declares. Choice chords fire
  // app-wide rather than only while their own field has focus, so two fields
  // claiming "p" is a real ambiguity — there would be no way to say which one
  // the keystroke meant.
  const seen = new Map<string, string>();

  const claim = (chord: string, owner: string, path: (string | number)[]): void => {
    const prior = seen.get(chord);
    if (prior) {
      issue(ctx, ctx.value, path, `Shortcut "${chord}" is already used by ${prior}.`);
    } else {
      seen.set(chord, owner);
    }
    // A config claiming a chord the OS owns takes it away for good: the renderer
    // calls preventDefault on a match, so `mod+v` would stop Paste working in
    // the notes box with nothing on screen to explain why.
    if (isReservedChord(chord)) {
      issue(ctx, ctx.value, path, `Shortcut "${chord}" is reserved by the app or the OS.`);
    }
  };

  fields.forEach((field, fi) => {
    if (field.shortcut) {
      claim(field.shortcut, `"${field.name}"`, [...basePath, fi, "shortcut"]);
    }

    // A multi-select is an `array` of `enum`; its options take chords too, and
    // the chord toggles rather than replaces.
    const choices = choicesOf(field);
    if (!choices) return;
    choices.list.forEach((choice, ci) => {
      if (!choice.shortcut) return;
      claim(choice.shortcut, `choice "${choice.name}" on "${field.name}"`, [
        ...basePath,
        fi,
        ...choices.path,
        ci,
        "shortcut",
      ]);
    });
  });
}

/** The selectable options of a field, single-choice or multi-select alike. */
function choicesOf(
  field: OutputField,
): { list: readonly { name: string; shortcut?: string }[]; path: string[] } | undefined {
  if (field.type === "enum") return { list: field.choices, path: ["choices"] };
  if (field.type === "array" && field.items.type === "enum") {
    return { list: field.items.choices, path: ["items", "choices"] };
  }
  return undefined;
}

function validateConfig(ctx: CheckCtx, cfg: AppConfig): void {
  const inputNames = new Set(cfg.input.fields.map((f) => f.name));
  const outputNames = new Set(cfg.output.fields.map((f) => f.name));

  assertUnique(
    ctx,
    cfg.input.fields.map((f) => f.name),
    ["input", "fields"],
    "input field",
  );
  assertUnique(
    ctx,
    cfg.output.fields.map((f) => f.name),
    ["output", "fields"],
    "output field",
  );
  assertUnique(ctx, cfg.input.cards?.map((c) => c.name) ?? [], ["input", "cards"], "input card");
  assertUnique(ctx, cfg.output.cards?.map((c) => c.name) ?? [], ["output", "cards"], "output card");

  cfg.input.fields.forEach((f, i) => validateTables(ctx, f, ["input", "fields", i]));
  cfg.output.fields.forEach((f, i) => validateTables(ctx, f, ["output", "fields", i]));

  validateCards(ctx, cfg.input.cards, inputNames, ["input", "cards"], "input");
  validateCards(ctx, cfg.output.cards, outputNames, ["output", "cards"], "output");

  // Regexes are compiled here so a bad pattern fails at load, not at render.
  cfg.input.fields.forEach((field, i) => {
    if (field.type === "text" && field.pattern !== undefined) {
      try {
        RegExp(field.pattern);
      } catch {
        issue(ctx, ctx.value, ["input", "fields", i, "pattern"], "Invalid regular expression.");
      }
    }
  });

  cfg.output.fields.forEach((field, i) => {
    const fill = field.fill ?? { kind: "user" as const };

    if (field.type === "text" && field.pattern !== undefined) {
      try {
        RegExp(field.pattern);
      } catch {
        issue(ctx, ctx.value, ["output", "fields", i, "pattern"], "Invalid regular expression.");
      }
    }

    if (fill.kind === "copy") {
      const from = fill.from ?? field.name;
      const source = cfg.input.fields.find((f) => f.name === from);
      if (!source) {
        issue(
          ctx,
          ctx.value,
          ["output", "fields", i, "fill", "from"],
          `Copies from unknown input field "${from}".`,
        );
      } else if (source.type !== field.type) {
        // Prepare re-reads *-output.csv cell by cell using the declared type,
        // so a mismatch silently mistypes the column on the way back in.
        issue(
          ctx,
          ctx.value,
          ["output", "fields", i, "type"],
          `Type "${field.type}" does not match input field "${from}" of type "${source.type}".`,
        );
      }
    }

    if (!isInteractiveFill(fill.kind)) {
      if (field.shortcut !== undefined) {
        issue(
          ctx,
          ctx.value,
          ["output", "fields", i, "shortcut"],
          `A "${fill.kind}" field renders no widget, so there is nothing to focus.`,
        );
      }
      if ("widget" in field && field.widget !== undefined) {
        issue(
          ctx,
          ctx.value,
          ["output", "fields", i, "widget"],
          `A "${fill.kind}" field renders no widget.`,
        );
      }
    } else if (WIDGETS_BY_TYPE[field.type].length === 0) {
      issue(
        ctx,
        ctx.value,
        ["output", "fields", i, "type"],
        `"${field.type}" fields cannot be filled by a user; give the field a \`fill\`.`,
      );
    }
  });

  collectShortcuts(ctx, cfg.output.fields, ["output", "fields"]);

  // A rule can only decorate something that is rendered.
  cfg.input.rules?.forEach((rule, ri) => {
    const referenced = [rule.when.field, ...(rule.appliesTo ?? [])];
    referenced.forEach((name) => {
      if (!inputNames.has(name)) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri],
          `Rule references unknown input field "${name}".`,
        );
      }
    });
    if ("otherField" in rule.when && rule.when.otherField !== undefined) {
      if (!inputNames.has(rule.when.otherField)) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri, "when", "otherField"],
          `Rule references unknown input field "${rule.when.otherField}".`,
        );
      }
    }
    if ("value" in rule.when && "otherField" in rule.when) {
      const hasValue = rule.when.value !== undefined;
      const hasField = rule.when.otherField !== undefined;
      if (hasValue === hasField) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri, "when"],
          "Give exactly one of `value` or `otherField`.",
        );
      }
    }
    if (rule.when.op === "matches") {
      try {
        RegExp(rule.when.pattern);
      } catch {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri, "when", "pattern"],
          "Invalid regular expression.",
        );
      }
    }
  });

  // An appTitle bound to a field must name one that exists.
  const appTitle = cfg.ui?.appTitle;
  if (appTitle !== undefined && typeof appTitle !== "string" && !inputNames.has(appTitle.field)) {
    issue(ctx, ctx.value, ["ui", "appTitle", "field"], `Unknown input field "${appTitle.field}".`);
  }
}

/**
 * The cards to render: the author's, or one implicit card holding every field
 * one per row. Cards are optional on both sides, so a small config needn't
 * spend six lines describing the only possible layout.
 *
 * The caller decides which names belong — the output side passes only the
 * fields a person actually fills.
 */
export function resolveCards(
  cards: readonly Card[] | undefined,
  fieldNames: readonly string[],
): Card[] {
  if (cards && cards.length > 0) return [...cards];
  return [{ name: "fields", rows: fieldNames.map((name) => ({ use: [name] })) }];
}

export { Choice, Style, TextDisplay, FieldDisplay };
