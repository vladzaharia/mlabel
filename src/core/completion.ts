import { fillKind, isRequired } from "./automapping";
import type { OutputField } from "./config/schema";
import type { CompletionStatus, LabeledRecord } from "./types/labeling";
import type { CoercedValue } from "./types/values";

export interface FieldError {
  field: string;
  message: string;
}

export interface RecordEvaluation {
  status: CompletionStatus;
  errors: FieldError[];
}

function isProvided(value: CoercedValue | undefined): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Validate a provided value against its field's declared type.
 *
 * Switches on the *type*, sharing a discriminant with `coerceValue`. Previously
 * this switched on the widget, which meant presentation-only variants
 * (`number`/`slider`, `text`/`textarea`) had to be kept in sync by hand, and
 * composite values could not be validated at all.
 */
export function validateOutputValue(field: OutputField, value: CoercedValue): string | null {
  switch (field.type) {
    case "text": {
      const s = typeof value === "string" ? value : String(value);
      if (field.minLength !== undefined && s.length < field.minLength)
        return `Must be at least ${String(field.minLength)} characters.`;
      if (field.maxLength !== undefined && s.length > field.maxLength)
        return `Must be at most ${String(field.maxLength)} characters.`;
      if (field.pattern !== undefined && !RegExp(field.pattern).test(s))
        return "Does not match the required format.";
      return null;
    }

    case "integer":
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) return "Must be a number.";
      if (field.type === "integer" && !Number.isInteger(value)) return "Must be a whole number.";
      if (field.min !== undefined && value < field.min) return `Must be ≥ ${String(field.min)}.`;
      if (field.max !== undefined && value > field.max) return `Must be ≤ ${String(field.max)}.`;
      return null;
    }

    case "boolean":
      return typeof value === "boolean" ? null : "Must be a boolean.";

    case "date":
      return value instanceof Date && !Number.isNaN(value.getTime()) ? null : "Must be a date.";

    case "enum": {
      const allowed = field.choices.map((c) => c.name);
      return allowed.includes(String(value)) ? null : `Must be one of: ${allowed.join(", ")}.`;
    }

    case "array": {
      if (!Array.isArray(value)) return "Must be a list.";
      // Multi-select: every selected item must still be a legal choice.
      if (field.items.type === "enum") {
        const allowed = field.items.choices.map((c) => c.name);
        if (value.some((item) => !allowed.includes(String(item)))) {
          return `Must be chosen from: ${allowed.join(", ")}.`;
        }
      }
      return null;
    }

    case "object":
    case "map":
      // Display-only shapes: nothing captures them, so there is nothing to check.
      return null;
  }
}

/**
 * Evaluate a record's label values: `complete` when every required field is
 * provided and valid; `unlabeled` when the user has filled nothing; otherwise
 * `partial`.
 *
 * `labelValues` is expected to already carry session and timestamp values —
 * merging happens in one place upstream so that this and the export split can
 * never disagree about what will be written.
 */
export function evaluateRecord(
  labelValues: Readonly<Record<string, CoercedValue | undefined>>,
  outputFields: readonly OutputField[],
): RecordEvaluation {
  const errors: FieldError[] = [];
  let requiredOk = true;
  let userProvided = 0;

  for (const field of outputFields) {
    const value = labelValues[field.name];
    const provided = isProvided(value);

    // Only per-record answers count as "the user has started this record" — a
    // session value is provided once and would otherwise make every untouched
    // record read as partially labeled.
    if (provided && fillKind(field) === "user") userProvided += 1;

    if (provided) {
      const error = validateOutputValue(field, value as CoercedValue);
      if (error) {
        errors.push({ field: field.name, message: error });
        if (isRequired(field)) requiredOk = false;
      }
    } else if (isRequired(field)) {
      requiredOk = false;
    }
  }

  const complete = requiredOk && errors.length === 0;
  const status: CompletionStatus = complete
    ? "complete"
    : userProvided === 0
      ? "unlabeled"
      : "partial";
  return { status, errors };
}

/** Convenience: count complete records in a list. */
export function countComplete(
  records: readonly LabeledRecord[],
  outputFields: readonly OutputField[],
): number {
  let n = 0;
  for (const record of records) {
    if (evaluateRecord(record.labelValues, outputFields).status === "complete") n += 1;
  }
  return n;
}
