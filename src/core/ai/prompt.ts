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

/**
 * The context window, in characters rather than tokens.
 *
 * The worker allocates a 4096-token KV cache. Three chars per token is a
 * deliberate under-estimate: this data — emails, ids, hex, timestamps — packs
 * denser than prose, and being wrong in this direction wastes a little room
 * while being wrong in the other truncates the record inside llama.cpp, where
 * nothing in this file would know it had happened.
 */
const CONTEXT_CHARS = 4096 * 3;

/** Room kept for the reply: `reasoning` plus four findings plus JSON overhead. */
const OUTPUT_RESERVE = 1600;

/** Never squeeze the record below this, whatever the instructions cost. */
const MIN_RECORD_BUDGET = 1500;

/**
 * How much of the record the model may be shown.
 *
 * Derived from the prefix rather than fixed, because the prefix is not fixed:
 * `ai.context` is author-supplied and allowed up to 2000 characters, and a
 * config that uses all of it would otherwise push the record out of the window.
 * The two are competing for one budget, so the one that varies has to be
 * measured rather than assumed.
 */
export const recordBudget = (prefix: string): number =>
  Math.max(CONTEXT_CHARS - prefix.length - OUTPUT_RESERVE, MIN_RECORD_BUDGET);

/**
 * No field is squeezed below this, however many there are.
 *
 * A very wide config will exceed `RECORD_BUDGET` rather than render every
 * column down to a useless stub. Showing forty fields as forty fragments is
 * worse than being slightly over budget.
 */
const MIN_PER_FIELD = 120;

/**
 * Divide the budget so short values subsidise long ones.
 *
 * An equal split is the wrong answer when one column holds a ten-item list and
 * the rest hold a word each: the list is where the signal is, and it is the only
 * one that would be cut. This is max-min fairness — everyone gets an equal
 * share, whatever they do not need is handed back, and the surplus is split
 * again among those still short. Repeated until nothing more can be given away.
 *
 * The practical effect on a real config: a `prev_10_emails` column that used to
 * arrive cut off mid-address now arrives whole, paid for by the single-word
 * columns beside it that were never near their limit.
 */
function allocate(lengths: readonly number[], budget: number): number[] {
  const caps = lengths.map(() => 0);
  const settled = lengths.map(() => false);
  let remaining = budget;
  let open = lengths.length;

  while (open > 0) {
    const share = Math.max(Math.floor(remaining / open), MIN_PER_FIELD);
    // Anyone who fits inside their share is settled at their true length, and
    // the difference goes back into the pot for the next pass.
    let settledAny = false;
    for (const [i, length] of lengths.entries()) {
      if (settled[i] || length > share) continue;
      caps[i] = length;
      settled[i] = true;
      remaining -= length;
      open -= 1;
      settledAny = true;
    }
    if (!settledAny) {
      // Everyone left wants more than an equal share, so an equal share is the
      // fairest thing left to give them.
      for (const [i] of lengths.entries()) {
        if (!settled[i]) caps[i] = share;
      }
      break;
    }
  }
  return caps;
}

/**
 * One value, cut to fit and *saying so* if it was cut.
 *
 * The marker is not decoration. Before it existed the model was handed
 * `…@ijust…` and reported "truncated entry may not fully represent the intended
 * neighbor list" as a finding — flagging the app's own display limit as a defect
 * in the labeler's data. A value that announces it was shortened is a value the
 * model stops treating as evidence.
 */
function render(value: CoercedValue | undefined, cap: number): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}… [shortened to fit; ${String(text.length)} characters in full]`;
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
    // Deliberately qualitative. Both budgets are enforced by the grammar, and
    // stating them here as *numbers* was measurably worse: Qwen3.5 4B went from
    // 12 findings in 14 records to none, answering tersely and then having
    // nothing to report. The grammar can hold the line without the instructions
    // making brevity sound like the goal.
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

/**
 * One record, rendered for the model.
 *
 * Rendered twice: once unbounded to learn how long each value actually is, then
 * again against the caps that knowledge buys. Two passes over one row is
 * nothing next to a decode, and it is what lets a wide column borrow room from
 * its narrow neighbours instead of every column being cut to the same length.
 */
export function buildSuffix(
  fields: readonly InputField[],
  values: Readonly<Record<string, CoercedValue | undefined>>,
  // Callers that hold the prefix should pass `recordBudget(prefix)`. The default
  // assumes a prefix of average length, which is the right answer for a caller
  // that has not got one to hand.
  budget: number = recordBudget(""),
): string {
  const full = fields.map((f) => render(values[f.name], Number.POSITIVE_INFINITY));
  const caps = allocate(
    full.map((t) => t.length),
    budget,
  );
  const rows = fields
    .map((f, i) => `${f.name}: ${render(values[f.name], caps[i] ?? MIN_PER_FIELD)}`)
    .join("\n");
  return ["The row to review:", rows].join("\n");
}

export function buildPrompt(
  fields: readonly InputField[],
  values: Readonly<Record<string, CoercedValue | undefined>>,
  context?: string,
): Prompt {
  const prefix = buildPrefix(fields, context);
  return { prefix, suffix: buildSuffix(fields, values, recordBudget(prefix)) };
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
