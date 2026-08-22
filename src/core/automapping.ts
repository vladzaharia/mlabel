import { isInteractiveFill, type FillKind, type OutputField } from "./config/schema";
import { defaultWidget, type Widget } from "./config/value-type";
import type { CoercedValue } from "./types/values";

/**
 * Who provides each output field's value, and what that implies.
 *
 * This used to be inferred: an output field was "auto-copied" when its name
 * happened to match an input column, or when it used the `hidden` control. That
 * convention made three things impossible — renaming a copied column, capturing
 * into a field whose name collides with an input column, and copying one input
 * into two outputs — and it meant "how it renders" and "where the value comes
 * from" were the same knob. `fill` states it outright instead.
 */

export function fillKind(field: OutputField): FillKind {
  return field.fill?.kind ?? "user";
}

/** The input field a `copy` field draws from — its own name unless renamed. */
export function copySource(field: OutputField): string | undefined {
  if (field.fill?.kind !== "copy") return undefined;
  return field.fill.from ?? field.name;
}

/** True when the field is answered by a person, on the record form or the setup step. */
export function isUserFilled(field: OutputField): boolean {
  return isInteractiveFill(fillKind(field));
}

/** True when the field is answered once per session rather than per record. */
export function isSessionFilled(field: OutputField): boolean {
  return fillKind(field) === "session";
}

/** True when the field is derived and renders no widget at all. */
export function isDerived(field: OutputField): boolean {
  return !isUserFilled(field);
}

/**
 * Required-ness defaults by fill: something a person is asked for is required,
 * something the app derives is not. An explicit `required` always wins.
 */
export function isRequired(field: OutputField): boolean {
  return field.required ?? isUserFilled(field);
}

/**
 * The widget this field renders with — the author's choice, or the type's
 * default. `undefined` for a derived field: nobody is asked for its value, so
 * there is nothing to render, whatever its type happens to be.
 */
export function widgetOf(field: OutputField): Widget | undefined {
  if (isDerived(field)) return undefined;
  const explicit = "widget" in field ? (field.widget as Widget | undefined) : undefined;
  return explicit ?? defaultWidget(field.type);
}

/**
 * Seed label values for a record: `copy` fields take the input value, everything
 * else starts unfilled. Session and timestamp values are merged separately, so
 * that one function owns "what will actually be exported".
 */
export function seedLabelValues(
  inputValues: Readonly<Record<string, CoercedValue>>,
  outputFields: readonly OutputField[],
): Record<string, CoercedValue | undefined> {
  const out: Record<string, CoercedValue | undefined> = {};
  for (const field of outputFields) {
    const from = copySource(field);
    out[field.name] = from === undefined ? undefined : (inputValues[from] ?? null);
  }
  return out;
}
