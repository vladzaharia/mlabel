export interface WriteQueue<T> {
  /** Latest-wins. Starts the drain loop if idle. */
  push(value: T): void;
  /** Resolves once the last pushed value has been written. Rejects with the
   *  last write error if the final write failed. Resolves immediately when the
   *  queue is idle or was never pushed to. */
  flush(): Promise<void>;
}

/**
 * Create a write queue that serialises calls to `write` with latest-value
 * semantics: bursts of pushes while a write is in-flight coalesce into a
 * single follow-up write once the current one completes.
 *
 * - Writes never interleave.
 * - The last pushed value always lands.
 * - A write error is stored and surfaced via `flush()` but does not stall
 *   the drain loop — the next push will trigger a fresh write attempt.
 */
export function createWriteQueue<T>(write: (value: T) => Promise<void>): WriteQueue<T> {
  // Boxed pending slot so T can include null/undefined without ambiguity.
  let pending: { value: T } | undefined;
  let draining: Promise<void> | undefined;
  let lastError: unknown;

  async function drain(): Promise<void> {
    // Intentionally serial: each write must complete before the next begins.
    // eslint-disable-next-line no-await-in-loop
    while (pending !== undefined) {
      const { value } = pending;
      pending = undefined;
      try {
        // eslint-disable-next-line no-await-in-loop
        await write(value);
        // A successful write clears any stored error.
        lastError = undefined;
      } catch (err) {
        lastError = err;
        console.error("[write-queue] write failed:", err);
      }
    }
    draining = undefined;
  }

  return {
    push(value: T): void {
      pending = { value };
      if (!draining) {
        draining = drain();
      }
    },

    async flush(): Promise<void> {
      // Wait for any in-flight drain loop to settle. `draining` is set to
      // undefined by drain() once it finishes, then potentially re-set by a
      // push that arrives while we were awaiting — loop until truly idle.
      // eslint-disable-next-line no-unmodified-loop-condition
      while (draining) {
        // eslint-disable-next-line no-await-in-loop
        await draining;
      }
      if (lastError !== undefined) throw lastError;
    },
  };
}
