import type { OutputField } from "./config/schema";
import type { CoercedValue } from "./types/values";

/**
 * An output field is auto-copied (rendered with no widget) when it explicitly
 * uses the `hidden` control, or when its name matches an input field — in which
 * case the value is carried over from the input automatically.
 */
export function isAutoCopied(field: OutputField, inputFieldNames: ReadonlySet<string>): boolean {
  return field.control === "hidden" || inputFieldNames.has(field.name);
}

/** True when the field's value comes from a same-named input column. */
export function hasInputSource(field: OutputField, inputFieldNames: ReadonlySet<string>): boolean {
  return inputFieldNames.has(field.name);
}

/**
 * Seed label values for the auto-copied output fields from the coerced input
 * values. User-facing fields are left `undefined` (unfilled).
 */
export function seedLabelValues(
  inputValues: Readonly<Record<string, CoercedValue>>,
  outputFields: readonly OutputField[],
  inputFieldNames: ReadonlySet<string>,
): Record<string, CoercedValue | undefined> {
  const out: Record<string, CoercedValue | undefined> = {};
  for (const field of outputFields) {
    out[field.name] = hasInputSource(field, inputFieldNames)
      ? (inputValues[field.name] ?? null)
      : undefined;
  }
  return out;
}
