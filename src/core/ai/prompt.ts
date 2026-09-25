import type { InputField } from "../config";
import { titleOf } from "../config";
import type { CoercedValue } from "../types/values";

/**
 * Building what the model is asked.
 *
 * The prompt is split in two and the split is load-bearing:
 *
 * - **`prefix`** — the instructions, the output contract, and the shape of the
 *   data. Identical for every record in a file.
 * - **`suffix`** — the one record under inspection.
 *
 * llama.cpp caches the KV state of a prompt's unchanging head, so an identical
 * prefix means only the record has to be processed on each call. On a mid-range
 * Windows laptop with no usable GPU that is the difference between roughly four
 * seconds to first token and well under one. It is the single biggest
 * performance lever available here, it costs nothing, and it evaporates the
 * moment anything record-specific leaks into the prefix.
 *
 * `prefixIsStable` exists so a test can hold that line.
 */

export interface Prompt {
  /** Identical across every record in a file. Keep it that way. */
  prefix: string;
  /** The record under inspection. */
  suffix: string;
}

/** Cap on a rendered value, so one enormous cell cannot crowd out the rest. */
const MAX_VALUE = 240;

function render(value: CoercedValue | undefined): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

/**
 * The instructions.
 *
 * Written to push against the two failure modes a small model has here: saying
 * something about every record because it thinks that is the job, and inventing
 * a concern that needs outside knowledge it does not have.
 */
function instructions(fields: readonly InputField[], context?: string): string {
  const columns = fields
    .map((f) => `- ${f.name} (${f.type})${f.display ? `: ${titleOf(f.name, f.display)}` : ""}`)
    .join("\n");

  // Column names and types say what the data *is*. Only the config author can
  // say what it *means* — what the file is, which columns relate to which, and
  // what would count as odd in this particular domain. Without it the model is
  // reduced to guessing the shape of a row; the section is omitted rather than
  // left empty so a config that says nothing costs nothing.
  const about =
    context !== undefined && context.trim() !== "" ? ["", "About this data:", context.trim()] : [];

  return [
    "You are helping a human reviewer read one row of a data file.",
    "Point out anything that looks internally inconsistent or out of place — a value that",
    "contradicts another value in the same row, or is obviously the wrong kind of thing for",
    "its column.",
    ...about,
    "",
    "Rules:",
    "- Most rows are unremarkable. Returning an empty list is the correct answer, and the",
    "  common one. Do not invent a concern to seem useful.",
    "- Judge only what is in front of you. You cannot look anything up.",
    "- Use `warning` only when a human would want to slow down and check. Otherwise `info`.",
    "- Write `reasoning` first, in one or two plain sentences. It is not shown to anyone.",
    "- Each `reason` is one short sentence a reviewer can act on.",
    "",
    "The columns in this file:",
    columns,
  ].join("\n");
}

/**
 * The instructions and the file's shape — everything that does not vary per record.
 *
 * `context` is `ai.context` from the loaded config. It belongs to the file
 * rather than the row, so it lives here and costs the KV cache nothing.
 */
export const buildPrefix = (fields: readonly InputField[], context?: string): string =>
  instructions(fields, context);

/** One record, rendered for the model. */
export function buildSuffix(
  fields: readonly InputField[],
  values: Readonly<Record<string, CoercedValue | undefined>>,
): string {
  const rows = fields.map((f) => `${f.name}: ${render(values[f.name])}`).join("\n");
  return ["The row to review:", rows].join("\n");
}

export function buildPrompt(
  fields: readonly InputField[],
  values: Readonly<Record<string, CoercedValue | undefined>>,
  context?: string,
): Prompt {
  return { prefix: buildPrefix(fields, context), suffix: buildSuffix(fields, values) };
}

/**
 * Whether every prompt in a batch shares one prefix.
 *
 * A guard for the property the whole performance story rests on, so that a
 * future edit which interpolates something record-specific into the
 * instructions fails a test rather than quietly costing every user four seconds
 * a record.
 */
export const prefixIsStable = (prompts: readonly Prompt[]): boolean =>
  prompts.every((p) => p.prefix === prompts[0]?.prefix);
