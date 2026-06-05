import { isAutoCopied } from "./automapping";
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

/** Validate a provided value against a field's control type + basic rules. */
export function validateOutputValue(field: OutputField, value: CoercedValue): string | null {
  switch (field.control) {
    case "number":
    case "slider": {
      if (typeof value !== "number" || Number.isNaN(value)) return "Must be a number.";
      if (field.min !== undefined && value < field.min) return `Must be ≥ ${String(field.min)}.`;
      if (field.max !== undefined && value > field.max) return `Must be ≤ ${String(field.max)}.`;
      return null;
    }
    case "checkbox":
      return typeof value === "boolean" ? null : "Must be a boolean.";
    case "date":
      return value instanceof Date && !Number.isNaN(value.getTime()) ? null : "Must be a date.";
    case "radio":
    case "select": {
      const allowed = (field.options ?? []).map((o) => o.value);
      return allowed.includes(String(value)) ? null : `Must be one of: ${allowed.join(", ")}.`;
    }
    case "text":
    case "textarea": {
      const s = typeof value === "string" ? value : String(value);
      if (field.minLength !== undefined && s.length < field.minLength)
        return `Must be at least ${String(field.minLength)} characters.`;
      if (field.maxLength !== undefined && s.length > field.maxLength)
        return `Must be at most ${String(field.maxLength)} characters.`;
      if (field.regex && !new RegExp(field.regex).test(s))
        return "Does not match the required format.";
      return null;
    }
    case "hidden":
      return null;
  }
}

/**
 * Evaluate a record's label values: a record is `complete` when every required
 * field is provided and valid (and no provided field is invalid); `unlabeled`
 * when the user has filled nothing; otherwise `partial`.
 */
export function evaluateRecord(
  labelValues: Readonly<Record<string, CoercedValue | undefined>>,
  outputFields: readonly OutputField[],
  inputFieldNames: ReadonlySet<string>,
): RecordEvaluation {
  const errors: FieldError[] = [];
  let requiredOk = true;
  let userProvided = 0;

  for (const field of outputFields) {
    const value = labelValues[field.name];
    const provided = isProvided(value);
    const autoCopied = isAutoCopied(field, inputFieldNames);

    if (provided && !autoCopied) userProvided += 1;

    if (provided) {
      const error = validateOutputValue(field, value as CoercedValue);
      if (error) {
        errors.push({ field: field.name, message: error });
        if (field.required) requiredOk = false;
      }
    } else if (field.required) {
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

/** Convenience: count complete records in a list (drives the progress bar). */
export function countComplete(
  records: readonly LabeledRecord[],
  outputFields: readonly OutputField[],
  inputFieldNames: ReadonlySet<string>,
): number {
  let n = 0;
  for (const record of records) {
    if (evaluateRecord(record.labelValues, outputFields, inputFieldNames).status === "complete")
      n += 1;
  }
  return n;
}
