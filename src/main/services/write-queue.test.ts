import { describe, expect, it } from "vitest";
import { array, assert, asyncProperty, integer } from "fast-check";
import { createWriteQueue } from "./write-queue";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A write function that blocks on each call until `unblock()` is called. */
function makeBlockingWrite<T>(): {
  write: (value: T) => Promise<void>;
  /** Unblocks the current in-flight write (if any). Call once per write. */
  unblock: () => void;
  written: T[];
} {
  const written: T[] = [];
  // Queue of resolver functions, one per in-flight write.
  const resolvers: Array<() => void> = [];

  const write = (value: T): Promise<void> =>
    new Promise<void>((res) => {
      written.push(value);
      resolvers.push(res);
    });

  return {
    write,
    unblock: () => resolvers.shift()?.(),
    written,
  };
}

// ---------------------------------------------------------------------------
// flush on never-pushed queue
// ---------------------------------------------------------------------------
describe("write-queue: flush on never-pushed queue", () => {
  it("resolves immediately when nothing was ever pushed", async () => {
    const q = createWriteQueue<number>(async () => {});
    await expect(q.flush()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// flush when idle (all writes done)
// ---------------------------------------------------------------------------
describe("write-queue: flush when idle", () => {
  it("resolves immediately when the drain loop has finished", async () => {
    const calls: number[] = [];
    const q = createWriteQueue<number>(async (v) => {
      calls.push(v);
    });
    q.push(1);
    await q.flush();
    expect(calls).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// coalescing: bursts collapse to at most 2 writes
// ---------------------------------------------------------------------------
describe("write-queue: coalescing", () => {
  it("collapses 100 rapid pushes to exactly 2 writes when first write is blocked", async () => {
    const { write, unblock, written } = makeBlockingWrite<number>();
    const q = createWriteQueue<number>(write);

    // First push starts the drain loop (write 1 blocks).
    q.push(0);
    // 99 more pushes while the write is blocked — all collapse into one pending.
    for (let i = 1; i <= 99; i++) q.push(i);

    // Unblock the first write — the loop takes the pending slot and does write 2.
    unblock();

    // Now write 2 is in-flight; unblock it too so flush can resolve.
    // We need a tick to let the drain loop start write 2.
    await Promise.resolve();
    unblock();

    // Wait for everything to settle.
    await q.flush();

    expect(written.length).toBe(2);
    expect(written[0]).toBe(0);
    expect(written[1]).toBe(99); // latest value wins
  });
});

// ---------------------------------------------------------------------------
// latest-value guarantee
// ---------------------------------------------------------------------------
describe("write-queue: latest-value guarantee", () => {
  it("after flush the last written value equals the last pushed value", async () => {
    const written: string[] = [];
    const q = createWriteQueue<string>(async (v) => {
      written.push(v);
    });
    q.push("a");
    q.push("b");
    q.push("c");
    await q.flush();
    expect(written[written.length - 1]).toBe("c");
  });
});

// ---------------------------------------------------------------------------
// push(null) after push(data) → final write is null
// ---------------------------------------------------------------------------
describe("write-queue: null values", () => {
  it("push(null) after push(data) results in null as the final write", async () => {
    const written: (string | null)[] = [];
    const q = createWriteQueue<string | null>(async (v) => {
      written.push(v);
    });
    q.push("data");
    q.push(null);
    await q.flush();
    expect(written[written.length - 1]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// error handling: flush rejects when final write threw
// ---------------------------------------------------------------------------
describe("write-queue: error handling", () => {
  it("flush rejects with lastError when the final write threw", async () => {
    const boom = new Error("boom");
    const q = createWriteQueue<number>(async () => {
      throw boom;
    });
    q.push(1);
    await expect(q.flush()).rejects.toBe(boom);
  });

  it("a throwing write does not stall later pushes", async () => {
    let callCount = 0;
    const written: number[] = [];
    const q = createWriteQueue<number>(async (v) => {
      callCount++;
      if (callCount === 1) throw new Error("transient");
      written.push(v);
    });
    q.push(1); // first write throws
    await q.flush().catch(() => {}); // ignore the rejection

    // Push again — should drain normally.
    q.push(2);
    await q.flush().catch(() => {}); // the queue stored lastError from call 1; second call succeeds
    expect(written).toContain(2);
  });

  it("flush resolves cleanly when last write succeeded after a prior failure", async () => {
    let callCount = 0;
    const q = createWriteQueue<number>(async () => {
      callCount++;
      if (callCount === 1) throw new Error("transient");
      // second call succeeds
    });
    q.push(1); // throws
    await q.flush().catch(() => {});
    q.push(2); // succeeds
    await expect(q.flush()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// No overlapping writes (fast-check property)
// ---------------------------------------------------------------------------
//
// Schedule shape: fc generates an array of batches, e.g. [[3,1], [7], [2,5]].
// - batch[0] is pushed synchronously before the first write starts.
// - Each subsequent batch is pushed from WITHIN the in-flight write (i.e.
//   while the fake write is blocked on a deferred promise), ensuring the
//   queue receives pushes during an active write — the scenario the drain-loop
//   guard is there to handle.
// After all batches are injected and all writes complete, we assert:
//   (a) recorded write start/end intervals never overlap, and
//   (b) after flush, the last written value equals the last pushed value.
describe("write-queue: no overlapping writes (property)", () => {
  it("writes never overlap and last value lands under mid-write push injections", async () => {
    await assert(
      asyncProperty(
        // At least 2 batches so there is always at least one mid-write injection.
        array(array(integer({ min: 0, max: 99 }), { minLength: 1, maxLength: 5 }), {
          minLength: 2,
          maxLength: 6,
        }),
        async (batches) => {
          const intervals: Array<[number, number]> = [];
          const written: number[] = [];
          let time = 0;

          // resolveCurrentWrite holds the resolver for the write currently
          // blocked inside the fake write function. The test calls it to
          // unblock exactly the one write at a time, so we drive the sequence
          // synchronously in a step-by-step manner.
          let resolveCurrentWrite: (() => void) | undefined;

          const q = createWriteQueue<number>(async (v) => {
            const start = time++;
            await new Promise<void>((res) => {
              resolveCurrentWrite = res;
            });
            const end = time++;
            intervals.push([start, end]);
            written.push(v);
            resolveCurrentWrite = undefined;
          });

          // Push batch[0] synchronously — this starts the drain loop and the
          // fake write blocks immediately waiting for resolveCurrentWrite().
          for (const v of batches[0]!) q.push(v);

          // For each remaining batch:
          //   1. Yield one microtask tick so the drain loop reaches `await new
          //      Promise(...)` inside the fake write and sets resolveCurrentWrite.
          //   2. Push the batch (injecting values while the write is blocked).
          //   3. Unblock the current write and yield again so the loop iteration
          //      finishes and either picks up the new pending slot or exits.
          for (let i = 1; i < batches.length; i++) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve(); // let drain loop block on resolveCurrentWrite
            for (const v of batches[i]!) q.push(v);
            resolveCurrentWrite?.(); // unblock the blocked write
            // eslint-disable-next-line no-await-in-loop
            await Promise.resolve(); // let drain loop complete this iteration
          }

          // Unblock any remaining writes spawned by the drain loop after the
          // final batch. We know the drain loop runs at most one write per
          // pending slot, and there can be at most one pending slot after our
          // last batch, so at most one more write will start.
          await Promise.resolve();
          resolveCurrentWrite?.();

          await q.flush();

          const lastPushed = batches.flat().at(-1)!;

          // (a) No two write intervals may overlap: [a,b] ∩ [c,d] ≠ ∅ iff a<d && c<b.
          for (let i = 0; i < intervals.length; i++) {
            for (let j = i + 1; j < intervals.length; j++) {
              const [a, b] = intervals[i]!;
              const [c, d] = intervals[j]!;
              if (a < d && c < b) return false;
            }
          }

          // (b) Last written value must equal last pushed value.
          return written.length > 0 && written[written.length - 1] === lastPushed;
        },
      ),
      { numRuns: 200 },
    );
  });
});
