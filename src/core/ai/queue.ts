/**
 * Deciding what to analyse next.
 *
 * Analysing a record costs seconds, not milliseconds — up to eight on a
 * mid-range Windows laptop with no usable GPU. Asked for on demand that is
 * unusable; run ahead of the labeler while they read, it is usually already
 * there by the time they arrive. This module is the policy for "run ahead",
 * with no timers, no model and no I/O, so it can be tested as arithmetic.
 */

export interface SchedulerState {
  /** Where the labeler is. */
  index: number;
  /** How many records there are. */
  count: number;
  /** Record indices already analysed, for the current model. */
  done: ReadonlySet<number>;
  /** The record being analysed right now, if any. */
  running: number | null;
}

export interface Schedule {
  /** What to start next, or null to stay idle. */
  start: number | null;
  /** Whether the in-flight job is no longer worth finishing. */
  abandonRunning: boolean;
}

/**
 * How far ahead of the labeler to work.
 *
 * Small on purpose. Every queued record is memory held and battery spent on a
 * guess about where someone is going, and a labeler who jumps around the file
 * invalidates all of it. Three is enough to stay ahead of steady reading.
 */
export const LOOK_AHEAD = 3;

/**
 * Records worth analysing, nearest first.
 *
 * The current record, then forward. Deliberately not backwards: a labeler who
 * has moved on has already looked at what is behind them, and analysing it
 * spends the budget on the one place the answer is certainly too late.
 */
export function horizon(index: number, count: number): number[] {
  const out: number[] = [];
  for (let i = index; i < Math.min(count, index + LOOK_AHEAD + 1); i++) out.push(i);
  return out;
}

/**
 * What the worker should do next.
 *
 * Called whenever anything changes — the labeler moved, a job finished, the
 * model changed. Pure, so the answer depends only on the state handed in.
 */
export function schedule(state: SchedulerState): Schedule {
  const wanted = horizon(state.index, state.count).filter((i) => !state.done.has(i));

  // A job the labeler has navigated away from is not worth finishing: it is
  // holding the only worker, and the record they are actually looking at is
  // waiting behind it.
  const abandonRunning = state.running !== null && !wanted.includes(state.running);

  if (state.running !== null && !abandonRunning) return { start: null, abandonRunning: false };

  const next = wanted.find((i) => i !== state.running) ?? null;
  return { start: next, abandonRunning };
}

/**
 * Whether a cached analysis still applies.
 *
 * A cache keyed only by record index would survive a model change and show
 * Qwen3-1.7B's opinion under Qwen3.5-2B's name.
 */
export const cacheIsValid = (cachedModelId: string, currentModelId: string): boolean =>
  cachedModelId === currentModelId;
