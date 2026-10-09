import type { NetworkLogEntry } from "@core";
import { createRingLog, type RingLog, type RingLogOptions } from "./ring-log";

/**
 * A short, in-memory record of every network call the app made or refused.
 *
 * See {@link createRingLog} for why it is in memory and capped.
 */
export type NetworkLog = RingLog<NetworkLogEntry>;
export type NetworkLogOptions = RingLogOptions;

export const createNetworkLog = (options: NetworkLogOptions = {}): NetworkLog =>
  createRingLog<NetworkLogEntry>(options);

/** The process-wide log. One buffer, whatever window is asking. */
export const networkLog: NetworkLog = createNetworkLog();
