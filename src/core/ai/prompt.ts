import type { InputField } from "../config";
import { titleOf } from "../config";
import type { CoercedValue } from "../types/values";
import { lettersFor } from "./letters";
import type { TargetedQuestion } from "./question";

/**
 * Building what the model is asked.
 *
 * The prompt is in three parts and the split is load-bearing:
 *
 * - **`prefix`** — the instructions and the shape of the data. Identical for
 *   every record in a file.
 * - **`suffix`** — the record under inspection, and the nearby records it is
 *   being compared against.
 * - **the questions** — appended one at a time by the engine, each read and then
 *   erased back to the end of the suffix.
 *
 * llama.cpp caches the KV state of a prompt's unchanging head, so an identical
 * prefix means only the record has to be processed on each call. On a mid-range
 * Windows laptop with no usable GPU that is the difference between roughly four
 * seconds and well under one. It is the single biggest performance lever
 * available here, it costs nothing, and it evaporates the moment anything
 * record-specific leaks into the prefix. `prefixIsStable` exists so a test can
 * hold that line.
 *
 * The third part is why every question must see the same state: the record is
 * encoded once and each question appended to it in turn. A per-question window
 * would mean a per-question encode, turning a fast feature into a slow one from
 * a config edit nobody would connect to the slowdown.
 */

export interface Prompt {
  /** Identical across every record in a file. Keep it that way. */
  prefix: string;
  /** The record under inspection, with its neighbours. */
  suffix: string;
}

/** How many records either side to show. */
export interface Neighbours {
  before: number;
  after: number;
}

/** One record, ready to render. */
export interface RenderedRecord {
  values: Readonly<Record<string, CoercedValue | undefined>>;
  /** The one being analysed. Exactly one per window. */
  current?: boolean;
}

/** Cap on a rendered value, so one enormous cell cannot crowd out the rest. */
const MAX_VALUE = 240;

/**
 * Cap on the whole suffix, in characters.
 *
 * Characters, not tokens, because this module is part of the system-agnostic core
 * and has no tokenizer — importing one would drag `node-llama-cpp` into `src/core`.
 * So the budget is deliberately conservative: roughly three characters per token
 * against an 8192-token context, leaving well over half of it for the
 * instructions and the questions. Overshooting here does not produce a wrong
 * answer, it produces a context-shift mid-analysis, which silently drops the
 * beginning of the prompt — the instructions — and changes what was asked.
 */
export const MAX_SUFFIX_CHARS = 12_000;

function render(value: CoercedValue | undefined): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (value instanceof Date) return value.toISOString();
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

/**
 * The instructions.
 *
 * Shorter than the free-text version it replaces, because most of what that one
 * had to say is now structural. It no longer needs to beg for an empty list —
 * "nothing here" is a low probability, which the threshold handles — nor explain
 * a severity scale, nor ask for reasoning in a field nobody reads. What is left
 * is the two things the model still has to be told: judge only what is in front
 * of it, and treat the neighbours as context rather than as subjects.
 */
function instructions(fields: readonly InputField[], context?: string): string {
  const columns = fields
    .map((f) => `- ${f.name} (${f.type})${f.display ? `: ${titleOf(f.name, f.display)}` : ""}`)
    .join("\n");

  // Column names and types say what the data *is*. Only the config author can
  // say what it *means* — what the file is, which columns relate to which, and
  // what would count as odd in this particular domain. The section is omitted
  // rather than left empty so a config that says nothing costs nothing.
  const about =
    context !== undefined && context.trim() !== "" ? ["", "About this data:", context.trim()] : [];

  return [
    "You are helping a human reviewer read one row of a data file.",
    "You will be shown one record, sometimes alongside nearby records from the same file,",
    "and then asked questions about it. Each question lists its possible answers.",
    ...about,
    "",
    "Rules:",
    "- Answer only about the record under review. Nearby records are there to show you what",
    "  ordinary looks like in this file; they are never the subject of the question.",
    "- Judge only what is in front of you. You cannot look anything up.",
    "- Answer with one of the letters offered, and nothing else.",
    "",
    "The columns in this file:",
    columns,
  ].join("\n");
}

/**
 * The instructions and the file's shape — everything that does not vary per record.
 *
 * `context` is `ai.context` from the loaded config. It belongs to the file rather
 * than the row, so it lives here and costs the KV cache nothing.
 */
export const buildPrefix = (fields: readonly InputField[], context?: string): string =>
  instructions(fields, context);

/**
 * Which records to show, clamped to the file.
 *
 * Returned in file order, with the current record always included, so "the row
 * above" means the row above. Clamped rather than padded: a phantom record would
 * be evidence the model could reason about and nobody could check.
 */
export function windowAround(index: number, count: number, neighbours: Neighbours): number[] {
  const start = Math.max(0, index - neighbours.before);
  const end = Math.min(count - 1, index + neighbours.after);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

/**
 * One question, with its answers labelled.
 *
 * The letters *are* the answer: the readout reads the probability of `A`, `B`,
 * `C` at the next position. So the labels here and `lettersFor` must stay in
 * lockstep, which is why both derive from the same order rather than each
 * formatting their own — and why a boolean's `A. yes` is written out rather than
 * left implied. If the two ever disagreed, every boolean would come back
 * inverted and nothing would raise an error.
 */
export function renderQuestion(question: TargetedQuestion): string {
  const letters = lettersFor(question);
  const suffixed = (text: string, note: string | undefined): string =>
    note === undefined || note === "" ? text : `${text} — ${note}`;

  const labels =
    question.type === "boolean"
      ? [suffixed("A. yes", question.whenTrue), suffixed("B. no", question.whenFalse)]
      : question.type === "choice"
        ? question.options.map((option, i) =>
            suffixed(`${letters[i]}. ${option.name}`, option.means),
          )
        : question.levels.map((level, i) => `${letters[i]}. ${level}`);

  return [question.ask, ...labels, "Answer with a single letter."].join("\n");
}

/**
 * The record under review, with its neighbours for comparison.
 *
 * Neighbours are added nearest-first until the budget runs out, so a tight
 * budget drops the farthest context rather than the most relevant — and the
 * record under review is rendered unconditionally, before any budget is
 * considered. A suffix that dropped *it* would ask the model about nothing while
 * still looking like a well-formed prompt.
 *
 * Only input values are shown. A neighbour's label is deliberately withheld:
 * showing it would let the model agree with a labeler's recent answers rather
 * than read the data, which is a plausible-looking failure that is very hard to
 * notice from the outside.
 */
export function buildSuffix(
  fields: readonly InputField[],
  window: readonly RenderedRecord[],
  maxChars: number = MAX_SUFFIX_CHARS,
): string {
  const rows = (record: RenderedRecord): string =>
    fields.map((f) => `${f.name}: ${render(record.values[f.name])}`).join("\n");

  const currentIndex = window.findIndex((record) => record.current === true);
  const at = currentIndex === -1 ? window.length - 1 : currentIndex;
  const parts: (string | undefined)[] = Array.from({ length: window.length });

  const subject = window[at];
  if (!subject) return "";
  parts[at] = `Record under review:\n${rows(subject)}`;
  let used = parts[at].length;

  // Nearest-first, alternating outwards, so "what fits" is the context closest
  // to the record rather than whatever happened to come first in the file.
  for (let distance = 1; distance < window.length; distance++) {
    for (const i of [at - distance, at + distance]) {
      const record = window[i];
      if (i < 0 || i >= window.length || !record) continue;
      const text = `Nearby record:\n${rows(record)}`;
      if (used + text.length + 2 > maxChars) continue;
      parts[i] = text;
      used += text.length + 2;
    }
  }

  return parts.filter((part): part is string => part !== undefined).join("\n\n");
}

export function buildPrompt(
  fields: readonly InputField[],
  window: readonly RenderedRecord[],
  context?: string,
): Prompt {
  return { prefix: buildPrefix(fields, context), suffix: buildSuffix(fields, window) };
}

/**
 * Whether every prompt in a batch shares one prefix.
 *
 * A guard for the property the whole performance story rests on, so that a future
 * edit which interpolates something record-specific into the instructions fails a
 * test rather than quietly costing every user seconds a record.
 */
export const prefixIsStable = (prompts: readonly Prompt[]): boolean =>
  prompts.every((p) => p.prefix === prompts[0]?.prefix);
