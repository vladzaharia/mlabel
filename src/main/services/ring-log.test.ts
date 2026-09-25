import { describe, expect, it, vi } from "vitest";
import { createRingLog, type RingEntry } from "./ring-log";

interface Thing extends RingEntry {
  label: string;
  done?: boolean;
}

const at = (t: number) => () => t;
const log = (capacity?: number) =>
  createRingLog<Thing>({ now: at(0), ...(capacity === undefined ? {} : { capacity }) });

// The eviction, id allocation and fan-out are shared by the network log and the
// model-call log. `network-log.test.ts` still covers that log's own contract;
// this covers the machinery underneath both, including `update`, which only the
// model log uses.
describe("createRingLog — update", () => {
  it("replaces an entry in place, keeping its id and timestamp", () => {
    const ring = log();
    const first = ring.record({ label: "a" });
    const updated = ring.update(first.id, { done: true });
    expect(updated).toEqual({ ...first, done: true });
    expect(ring.entries()).toEqual([updated]);
  });

  it("holds its position rather than moving to the end", () => {
    const ring = log();
    const first = ring.record({ label: "a" });
    ring.record({ label: "b" });
    ring.update(first.id, { done: true });
    expect(ring.entries().map((e) => e.label)).toEqual(["a", "b"]);
  });

  // A long-running call can outlive its own row. That is an ordinary outcome of
  // a capped buffer, not a failure worth throwing over.
  it("returns null for an entry that has been evicted", () => {
    const ring = log(2);
    const first = ring.record({ label: "a" });
    ring.record({ label: "b" });
    ring.record({ label: "c" });
    expect(ring.update(first.id, { done: true })).toBeNull();
  });

  it("tells subscribers about the update, so a live view redraws", () => {
    const ring = log();
    const seen = vi.fn();
    const first = ring.record({ label: "a" });
    ring.subscribe(seen);
    ring.update(first.id, { done: true });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ id: first.id, done: true });
  });
});
