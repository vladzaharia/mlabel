import { z } from "zod";
import { CHORD_KEY_ALIASES, isReservedChord, NAMED_KEYS } from "../shortcuts";
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

/**
 * Cap on `ai.context`, in characters.
 *
 * It rides in front of every record inside a 4096-token window, so it competes
 * with the record it is supposed to explain. Roughly 500 tokens leaves the row
 * and the model's answer plenty of room, and the limit is a load error rather
 * than a silent truncation — a config author who wrote three pages should find
 * out at load, not wonder why the model stopped seeing the last column.
 */
const MAX_AI_CONTEXT = 2000;

/**
 * A keyboard chord, e.g. `"p"`, `"mod+s"` or `"shift+up"` (mod = Cmd on macOS,
 * Ctrl elsewhere).
 *
 * Built from the same key table the runtime parses with, so the schema can
 * never accept a chord `parseChord` would refuse. Deliberately narrower than
 * `parseChord` in one respect: punctuation is not offered here. The app owns
 * `?` and `mod+,`, and keeping punctuation out of the config grammar means no
 * config can claim them however the reserved list changes later.
 */
const CHORD_MODIFIERS = "mod|ctrl|control|alt|opt|option|shift|meta|cmd|command";
const CHORD_KEYS = ["[A-Za-z0-9]", ...NAMED_KEYS.map((k) => k.token), ...CHORD_KEY_ALIASES].join(
  "|",
);
const Chord = z
  .string()
  .regex(
    new RegExp(`^(?:(?:${CHORD_MODIFIERS})\\+)*(?:${CHORD_KEYS})$`, "i"),
    'e.g. "p", "mod+s" or "shift+up"',
  );

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
  exceedsFactor:
    "True when the field is more than `factor` times the comparand — a difference in magnitude rather than merely being larger. Defined only over non-negative magnitudes: a negative value, or a comparand of zero or less, does not fire.",
  fallsBelowFactor:
    "True when the field is less than the comparand divided by `factor`. Defined only over non-negative magnitudes.",
  sameDomain:
    "True when both values carry an email domain and the domains match, compared without regard to case. A value with no `@` has no domain, so it never matches.",
  sameLocalPart:
    "True when both values share a local part — the text before the `@`, or the whole value when there is no `@` — compared without regard to case. That fallback is what lets a bare username be tested against a sender address.",
  sharesPrefix:
    "True when both values begin with the same `length` characters, compared without regard to case. For spotting identifiers minted together — a run of handles all starting `Bvd` — where what matters is that two values resemble each other, not what either looks like alone. A value shorter than `length` never matches.",
  allOf: "True when every listed condition holds. Conditions may nest.",
  anyOf: "True when at least one listed condition holds. Conditions may nest.",
  not: "True when the nested condition does not hold.",
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
 * A comparison that only relates two columns — there is no literal form, so
 * `otherField` is required rather than one of a pair.
 */
const relational = <T extends string>(op: T) =>
  z.strictObject({
    op: z.literal(op).meta({ description: OPS[op] }),
    field: TestedField,
    otherField: Identifier.meta({
      description:
        "The input field this one is measured against. Required — this operator has no literal form.",
    }),
  });

/**
 * A relational comparison scaled by a multiple.
 *
 * Separate operators for above and below rather than one signed factor: `-3`
 * reads as nothing in particular, and is ambiguous against `-0.33`.
 */
const factorComparison = <T extends string>(op: T) =>
  relational(op).extend({
    factor: z.number().positive().meta({
      description:
        "The multiple to scale the comparand by. `3` reads as 'three times'. A factor of 1 is legal and degenerates into a plain `gt` / `lt`.",
    }),
  });

/**
 * `sameDomain`, plus the domains too common to mean anything.
 *
 * Without this the rule fires on most rows of a real file — two accounts both
 * at gmail.com share nothing — and a colour that appears everywhere stops
 * carrying information. Expressed on the operator rather than as a second
 * overriding rule, because that alternative marks every free-provider address
 * whether or not it matched.
 */
const sameDomainCondition = relational("sameDomain").extend({
  ignore: z.array(z.string().min(1)).optional().meta({
    description:
      "Domains that never count as shared, compared without regard to case — the large free providers, typically. Two accounts both at `gmail.com` have nothing in common worth colouring.",
  }),
});

/** Leading-character agreement between an element and a record column. */
const sharesPrefixCondition = relational("sharesPrefix").extend({
  length: z.number().int().positive().meta({
    description:
      "How many leading characters must agree. Low values match by coincidence — 3 or 4 is usually where a shared prefix stops being an accident.",
  }),
});

/**
 * A rule's trigger. A discriminated union on `op` from the start, so composition
 * (`allOf` / `anyOf` / `not`, which carry no `field`) can be added later without
 * breaking existing configs.
 */
const LEAF_CONDITIONS = [
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
  factorComparison("exceedsFactor"),
  factorComparison("fallsBelowFactor"),
  sameDomainCondition,
  relational("sameLocalPart"),
  sharesPrefixCondition,
] as const;

/** Everything that tests a value directly — no nesting, no recursion. */
type LeafCondition = z.infer<z.ZodDiscriminatedUnion<typeof LEAF_CONDITIONS>>;

/**
 * A condition, including the composing ones.
 *
 * Written by hand rather than inferred because the composing operators refer
 * back to this type, and TypeScript cannot resolve a type from an initialiser
 * that mentions itself.
 */
export type Condition =
  | LeafCondition
  | { op: "allOf"; conditions: Condition[] }
  | { op: "anyOf"; conditions: Condition[] }
  | { op: "not"; condition: Condition };

/**
 * Composition carries no `field` of its own, which is why this union was
 * discriminated on `op` from the start.
 *
 * It earns its place because the signals that actually separate two populations
 * are usually conjunctions, and each half alone is far weaker than the pair.
 * Without it an author has to emit both halves as separate rules and leave the
 * reader to notice they coincided.
 */
export const Condition: z.ZodType<Condition> = z
  .discriminatedUnion("op", [
    ...LEAF_CONDITIONS,
    z.strictObject({
      op: z.literal("allOf").meta({ description: OPS["allOf"] }),
      conditions: z
        .array(z.lazy(() => Condition))
        .min(1)
        .meta({ description: "Every one of these must hold." }),
    }),
    z.strictObject({
      op: z.literal("anyOf").meta({ description: OPS["anyOf"] }),
      conditions: z
        .array(z.lazy(() => Condition))
        .min(1)
        .meta({ description: "At least one of these must hold." }),
    }),
    z.strictObject({
      op: z.literal("not").meta({ description: OPS["not"] }),
      condition: z.lazy(() => Condition).meta({ description: "The condition to negate." }),
    }),
  ])
  .meta({
    id: "Condition",
    title: "Condition",
    description:
      "A rule's trigger, evaluated over one record's input values. Never throws: a condition pointed at a missing or wrongly-typed value simply does not fire.",
  });

/**
 * Every input field a condition tests, in the order it mentions them.
 *
 * A composing condition has no `field` of its own, so the three things that
 * used to read `when.field` directly — validation, the default `appliesTo`, and
 * the per-item scope check — all need the set underneath instead. De-duplicated
 * so `allOf` over two tests of the same column does not style it twice.
 *
 * `otherField` is deliberately excluded: it is the comparand, not the subject,
 * and a rule comparing A to B is about A.
 */
/** A condition that tests a value directly, with no nesting below it. */
type Leaf = Exclude<Condition, { op: "allOf" | "anyOf" | "not" }>;

/**
 * Visit every value-testing condition in a tree.
 *
 * Every per-leaf check has to go through here rather than reading `when`
 * directly, or a condition tucked inside an `allOf` escapes validation
 * entirely — and the runtime is deliberately forgiving, so an unchecked
 * mistake shows up as a rule that never fires rather than as an error.
 */
export function forEachLeaf(condition: Condition, visit: (leaf: Leaf) => void): void {
  if (condition.op === "allOf" || condition.op === "anyOf") {
    for (const child of condition.conditions) forEachLeaf(child, visit);
  } else if (condition.op === "not") {
    forEachLeaf(condition.condition, visit);
  } else {
    visit(condition);
  }
}

export function conditionFields(condition: Condition): string[] {
  const out: string[] = [];
  const walk = (node: Condition): void => {
    if (node.op === "allOf" || node.op === "anyOf") {
      for (const child of node.conditions) walk(child);
    } else if (node.op === "not") {
      walk(node.condition);
    } else if (!out.includes(node.field)) {
      out.push(node.field);
    }
  };
  walk(condition);
  return out;
}

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
          "Fields to style when the rule fires. Defaults to the field the condition tests, which is what you want for a single-field rule and never what you want when comparing two. The default is skipped entirely when `appliesToCards` is given.",
      })
      .optional(),
    /** Cards to annotate. A separate key from `appliesTo` — see the description. */
    appliesToCards: z
      .array(Identifier)
      .min(1)
      .meta({
        description:
          "Input cards to annotate when the rule fires. A card-level note states once what would otherwise repeat on every field in the group. This is a separate key from `appliesTo` because card names and field names live in separate namespaces — a card may legitimately share a name with a field, and one list could not tell them apart.",
      })
      .optional(),
    /** Evaluate per element of a list, rather than once for the record. */
    forEach: Identifier.meta({
      description:
        "Evaluate this rule once per element of the named input field, which must be an `array`, and style the elements it holds for. Inside the loop, an element of an `array` of `object` is addressed by its own field names, which shadow a record column of the same name; an element of a list of scalars is addressed by the list's own name. Either way every other record column stays readable, so `otherField` compares an element against the record around it. Cannot be combined with `appliesTo` or `appliesToCards` — the target is always the matching element.",
    }).optional(),
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
     * Network policy. The app is local-first and performs exactly two kinds of
     * remote request, each with its own switch: the GitHub-Releases update
     * check, and downloading a model for anomaly detection. Setting both to
     * `false` forbids all network.
     */
    network: z
      .strictObject({
        updateChecks: z.boolean().default(true).meta({
          description:
            "Whether to check GitHub Releases for updates. Absent or `true` means checks run; `false` forbids that traffic entirely.",
        }),
        modelDownload: z.boolean().default(true).meta({
          description:
            "Whether the app may download an anomaly-detection model from Hugging Face. Absent or `true` means it may, once a labeler asks for it in Settings — nothing is fetched otherwise. `false` forbids that traffic entirely, and hides the feature unless a model is already on this machine.",
        }),
      })
      .default({ updateChecks: true, modelDownload: true })
      .meta({
        description:
          "Network policy. These are the only remote requests this app ever performs, and both are opt-out. With both `false` the app makes no network calls at all.",
      }),

    /**
     * On-device assistance. Off unless a labeler turns it on in Settings; this
     * flag governs whether they are offered the choice at all.
     */
    ai: z
      .strictObject({
        anomalyDetection: z.boolean().default(true).meta({
          description:
            "Whether labelers may enable on-device anomaly detection for this project. Absent or `true` offers it in Settings; nothing runs or downloads until it is switched on there. `false` removes the feature entirely — no section, no panel, no suggestions. Worth setting for a task where a model's guess sitting beside the answer could bias the labeler.",
        }),
        context: z.string().max(MAX_AI_CONTEXT).optional().meta({
          description:
            "What this data is, in your own words, given to the model along with each row. Column names and types tell it what the data *is*; only you can tell it what the data *means* — what the file is, which columns relate to which, and what would count as odd here. Without this a small model is guessing at the shape of a row. Keep it to a short paragraph: it is sent with every record, and a long one crowds out the record itself. Never include instructions about what to conclude — describe the data, not the answer.",
        }),
      })
      .default({ anomalyDetection: true })
      .meta({
        id: "AiConfig",
        title: "AI",
        description:
          "On-device assistance. Suggestions are advisory: they are never written to the output file and can never fill in an answer.",
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
  const inputCards = cfg.input.cards;
  const inputCardNames = new Set(inputCards?.map((c) => c.name) ?? []);

  cfg.input.rules?.forEach((rule, ri) => {
    // Inside a `forEach`, the tested field resolves against the list's elements
    // first, so the element's own fields count as known names too.
    let testable = inputNames;
    if (rule.forEach !== undefined) {
      const list = cfg.input.fields.find((f) => f.name === rule.forEach);
      if (!list) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri, "forEach"],
          `Rule iterates unknown input field "${rule.forEach}".`,
        );
      } else if (list.type !== "array") {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri, "forEach"],
          `Rule iterates "${rule.forEach}", which is not an array.`,
        );
      } else if (list.items.type === "object") {
        testable = new Set([...inputNames, ...list.items.fields.map((f) => f.name)]);
      }
      // A list of scalars contributes no new names: the element answers to the
      // list's own name, which is already in `inputNames`.
      if (rule.appliesTo !== undefined || rule.appliesToCards !== undefined) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri],
          "`forEach` cannot be combined with `appliesTo` or `appliesToCards`: a per-item rule always styles the element it matched.",
        );
      }
    }

    for (const name of conditionFields(rule.when)) {
      if (!testable.has(name)) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri],
          `Rule references unknown input field "${name}".`,
        );
      }
    }
    // `appliesTo` always names record columns, never an element's fields.
    (rule.appliesTo ?? []).forEach((name) => {
      if (!inputNames.has(name)) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri],
          `Rule references unknown input field "${name}".`,
        );
      }
    });

    if (rule.appliesToCards !== undefined) {
      // `resolveCards` invents a card named "fields" when none are declared, so
      // a bare "unknown card" here would send an author hunting for a typo in a
      // name they never wrote.
      if (!inputCards || inputCards.length === 0) {
        issue(
          ctx,
          ctx.value,
          ["input", "rules", ri, "appliesToCards"],
          "Rule annotates a card, but this config declares no `input.cards`.",
        );
      } else {
        rule.appliesToCards.forEach((name, ci) => {
          if (!inputCardNames.has(name)) {
            issue(
              ctx,
              ctx.value,
              ["input", "rules", ri, "appliesToCards", ci],
              `Rule references unknown input card "${name}".`,
            );
          }
        });
      }
    }

    // The comparand always reads the record, even inside a `forEach`.
    // Every leaf, not just the top one. A `matches` buried inside an `allOf`
    // still has to compile: `evaluateCondition` swallows a bad pattern and
    // returns false, so an unchecked one is a rule that silently never fires.
    forEachLeaf(rule.when, (leaf) => {
      if ("otherField" in leaf && leaf.otherField !== undefined) {
        if (!inputNames.has(leaf.otherField)) {
          issue(
            ctx,
            ctx.value,
            ["input", "rules", ri, "when", "otherField"],
            `Rule references unknown input field "${leaf.otherField}".`,
          );
        }
      }
      if ("value" in leaf && "otherField" in leaf) {
        const hasValue = leaf.value !== undefined;
        const hasField = leaf.otherField !== undefined;
        if (hasValue === hasField) {
          issue(
            ctx,
            ctx.value,
            ["input", "rules", ri, "when"],
            "Give exactly one of `value` or `otherField`.",
          );
        }
      }
      if (leaf.op === "matches") {
        try {
          RegExp(leaf.pattern);
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
