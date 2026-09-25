import type { ModelCallEntry } from "@core";
import { createRingLog, type RingLog, type RingLogOptions } from "../ring-log";

/**
 * A short, in-memory record of every time the model was asked about a record.
 *
 * The counterpart to the network log, and for the same reason: a claim a person
 * is asked to take on trust — *this runs locally*, *verify the results* — is
 * only checkable if they can see what actually happened. Here that means the
 * whole prompt and the raw reply, not a summary of them.
 *
 * Capacity is smaller than the network log's. An entry carries a full prompt,
 * so fifty of them is a few hundred kilobytes of record data held in memory for
 * a panel almost nobody opens.
 */
export type ModelLog = RingLog<ModelCallEntry>;

const CAPACITY = 20;

export const createModelLog = (options: RingLogOptions = {}): ModelLog =>
  createRingLog<ModelCallEntry>({ capacity: CAPACITY, ...options });

/** The process-wide log. One buffer, whatever window is asking. */
export const modelLog: ModelLog = createModelLog();
