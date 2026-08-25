/**
 * The one place tests describe a config.
 *
 * Specs here are **semantic**, not shaped like the config schema: a test says
 * "an output field that is a choice between good and bad", not "control: radio
 * with options". That indirection is deliberate — when the schema changes, only
 * the serializers below move, and the ~20 test files that use this stay put.
 */

import { loadConfig } from "@core/config";
import type { AppConfig } from "@core/config";
import type { ValueTypeShape } from "@core/config/value-type";

// --- Specs -----------------------------------------------------------------

/** A displayed source column. A bare string is shorthand for a text field. */
export type InputSpec =
  | string
  | {
      name: string;
      /** Defaults to text. */
      type?: ValueTypeShape;
      /** Marks this field's value as the app-bar title. At most one per config. */
      title?: boolean;
      displayName?: string;
      description?: string;
      help?: string;
      labelPosition?: "left" | "above";
      textSize?: "sm" | "md" | "lg";
    };

/**
 * What a captured field *is*, independent of which widget renders it.
 * `copied` carries over from the same-named input column; `session` is asked
 * once up front; `timestamp` is stamped by the app.
 */
export type OutputKind =
  | "text"
  | "textarea"
  | "number"
  | "slider"
  | "date"
  | "checkbox"
  | "choice"
  | "dropdown"
  | "copied"
  | "session"
  | "timestamp";

/** A choice: a bare string is shorthand for a value with no separate caption. */
export type ChoiceSpec = string | { value: string; label?: string; shortcut?: string };

export interface OutputSpec {
  name: string;
  /** Defaults to text. */
  kind?: OutputKind;
  /** Required for `choice` / `dropdown`. */
  choices?: ChoiceSpec[];
  min?: number;
  max?: number;
  step?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  required?: boolean;
  displayName?: string;
  description?: string;
  help?: string;
  labelPosition?: "left" | "above";
}

export interface RowSpec {
  columns?: number;
  fields: string[];
}

export interface CardSpec {
  id: string;
  displayName?: string;
  description?: string;
  help?: string;
  rows: RowSpec[];
}

export interface ConfigSpec {
  /** Defaults to a single `id` text field. */
  input?: InputSpec[];
  /** Defaults to a single `label` text field. */
  output?: OutputSpec[];
  /** Defaults to one card holding every input field in one row. */
  inputCards?: CardSpec[];
  /** Omitted by default — the renderer falls back to an implicit card. */
  outputCards?: CardSpec[];
  /** Omitted by default, which the schema reads as enabled. */
  updateChecks?: boolean;
  appTitle?: string;
}

// --- Serializers (the only part that moves when the schema changes) ---------

const TEXT: ValueTypeShape = { type: "text" };

/** Pack the presentation keys a spec carries into the schema's `display` block. */
function display(spec: {
  displayName?: string;
  description?: string;
  help?: string;
  labelPosition?: "left" | "above";
  textSize?: "sm" | "md" | "lg";
}): Record<string, unknown> | undefined {
  const block = {
    ...(spec.displayName === undefined ? {} : { title: spec.displayName }),
    ...(spec.description === undefined ? {} : { description: spec.description }),
    ...(spec.help === undefined ? {} : { help: spec.help }),
    ...(spec.labelPosition === undefined ? {} : { titlePosition: spec.labelPosition }),
    ...(spec.textSize === undefined ? {} : { textSize: spec.textSize }),
  };
  return Object.keys(block).length > 0 ? block : undefined;
}

function inputField(spec: InputSpec): Record<string, unknown> {
  if (typeof spec === "string") return { name: spec, ...TEXT };
  const { name, type, title: _title, ...rest } = spec;
  const block = display(rest);
  // A field *is* its type, so the type spreads onto the field itself.
  return { name, ...(type ?? TEXT), ...(block === undefined ? {} : { display: block }) };
}

function choice(spec: ChoiceSpec): Record<string, unknown> {
  if (typeof spec === "string") return { name: spec };
  return {
    name: spec.value,
    ...(spec.label === undefined ? {} : { display: { title: spec.label } }),
    ...(spec.shortcut === undefined ? {} : { shortcut: spec.shortcut }),
  };
}

/** Maps a semantic kind onto the schema's type + widget + fill. */
const SHAPE_FOR: Record<OutputKind, Record<string, unknown>> = {
  text: { type: "text" },
  textarea: { type: "text", widget: "textarea" },
  number: { type: "number" },
  slider: { type: "number", widget: "slider" },
  date: { type: "date" },
  checkbox: { type: "boolean" },
  choice: { type: "enum", widget: "radio" },
  dropdown: { type: "enum" },
  copied: { fill: { kind: "copy" } },
  session: { type: "text", fill: { kind: "session" } },
  timestamp: { type: "date", fill: { kind: "timestamp" } },
};

function outputField(
  spec: OutputSpec,
  inputTypes: Map<string, ValueTypeShape>,
): Record<string, unknown> {
  const {
    name,
    kind = "text",
    choices,
    pattern,
    min,
    max,
    step,
    minLength,
    maxLength,
    required,
    ...rest
  } = spec;
  const block = display(rest);
  // A copied field carries the type of the column it copies from, which the
  // schema checks: a mismatch would silently mistype the column on re-read.
  const shape =
    kind === "copied"
      ? { ...(inputTypes.get(name) ?? TEXT), ...SHAPE_FOR.copied }
      : SHAPE_FOR[kind];

  return {
    name,
    ...shape,
    ...(choices === undefined ? {} : { choices: choices.map(choice) }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(step === undefined ? {} : { step }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(required === undefined ? {} : { required }),
    ...(block === undefined ? {} : { display: block }),
  };
}

function card(spec: CardSpec): Record<string, unknown> {
  return {
    name: spec.id,
    display: { title: spec.displayName ?? spec.id.toUpperCase() },
    rows: spec.rows.map((row) => ({
      ...(row.columns === undefined ? {} : { perRow: row.columns }),
      use: row.fields,
    })),
  };
}

// --- Entry points ----------------------------------------------------------

const DEFAULT_INPUT: InputSpec[] = ["id"];
const DEFAULT_OUTPUT: OutputSpec[] = [{ name: "label" }];

/** Build the config as an object graph. Prefer `configText` / `buildConfig`. */
export function configObject(spec: ConfigSpec = {}): Record<string, unknown> {
  const input = spec.input ?? DEFAULT_INPUT;
  const output = spec.output ?? DEFAULT_OUTPUT;
  const inputCards = spec.inputCards ?? [];

  // `title: true` used to be a per-field flag; it is now a top-level reference.
  const titled = input.find((f) => typeof f !== "string" && f.title);
  const appTitle =
    spec.appTitle ?? (titled && typeof titled !== "string" ? { field: titled.name } : undefined);

  const inputTypes = new Map<string, ValueTypeShape>(
    input.map((f) => [
      typeof f === "string" ? f : f.name,
      (typeof f === "string" ? undefined : f.type) ?? TEXT,
    ]),
  );

  return {
    version: 2,
    ...(appTitle === undefined ? {} : { ui: { appTitle } }),
    ...(spec.updateChecks === undefined ? {} : { network: { updateChecks: spec.updateChecks } }),
    input: {
      fields: input.map(inputField),
      ...(inputCards.length > 0 ? { cards: inputCards.map(card) } : {}),
    },
    output: {
      fields: output.map((f) => outputField(f, inputTypes)),
      ...(spec.outputCards === undefined ? {} : { cards: spec.outputCards.map(card) }),
    },
  };
}

/** The config as JSONC text — for tests that exercise the loader itself. */
export function configText(spec: ConfigSpec = {}): string {
  return JSON.stringify(configObject(spec), null, 2);
}

/**
 * A parsed, defaults-applied `AppConfig`. Throws on an invalid spec so a broken
 * fixture fails loudly at setup rather than as a confusing assertion later.
 */
export function buildConfig(spec: ConfigSpec = {}): AppConfig {
  const result = loadConfig(configText(spec));
  if (!result.ok) {
    throw new Error(`test fixture config is invalid: ${JSON.stringify(result.issues, null, 2)}`);
  }
  return result.config;
}
