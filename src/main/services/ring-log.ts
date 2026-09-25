/**
 * A short, in-memory, append-only log with a fixed capacity.
 *
 * In memory on purpose, and that is the whole design rather than a shortcut.
 * This app's claim is that it is local and that it does not keep what you feed
 * it; the honest way to let someone check either is to show them what happened
 * — not to start an ever-growing file on disk recording it, which would be the
 * opposite of the promise. It dies with the process.
 *
 * Shared by the network log and the model-call log because the eviction, the
 * id allocation and the fan-out are identical, and a second hand-rolled copy is
 * a second place for the id-reuse bug below to come back.
 */

/** The fields a ring log stamps onto every entry it stores. */
export interface RingEntry {
  id: number;
  /** Epoch milliseconds. */
  at: number;
}

export interface RingLog<T extends RingEntry> {
  /** Append an entry. Returns the stored form, with its id and timestamp. */
  record: (entry: Omit<T, "id" | "at">) => T;
  /** Oldest first. */
  entries: () => readonly T[];
  /**
   * Replace an entry already recorded, matched by id.
   *
   * For a call that is logged when it starts and only known to have succeeded
   * later. Returns the updated form, or null if it has since been evicted —
   * which is not an error, just an old entry.
   */
  update: (id: number, patch: Partial<Omit<T, "id" | "at">>) => T | null;
  clear: () => void;
  subscribe: (listener: (entry: T) => void) => () => void;
}

export interface RingLogOptions {
  capacity?: number;
  /** Injected so tests are deterministic. */
  now?: () => number;
}

const DEFAULT_CAPACITY = 50;

export function createRingLog<T extends RingEntry>(options: RingLogOptions = {}): RingLog<T> {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const now = options.now ?? Date.now;

  let buffer: T[] = [];
  const listeners = new Set<(entry: T) => void>();
  // Monotonic across evictions and clears: the renderer keys rows by id, so a
  // reused one would silently collapse two different calls into one row.
  let nextId = 1;

  const announce = (entry: T): void => {
    for (const listener of listeners) {
      try {
        listener(entry);
      } catch {
        // A window that went away mid-send must not cost us the entry.
      }
    }
  };

  return {
    record(entry) {
      const stored = { ...entry, id: nextId++, at: now() } as T;
      buffer.push(stored);
      if (buffer.length > capacity) buffer = buffer.slice(buffer.length - capacity);
      announce(stored);
      return stored;
    },
    entries: () => buffer,
    update(id, patch) {
      const index = buffer.findIndex((entry) => entry.id === id);
      if (index === -1) return null;
      const updated = { ...buffer[index], ...patch } as T;
      buffer[index] = updated;
      announce(updated);
      return updated;
    },
    clear() {
      buffer = [];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
