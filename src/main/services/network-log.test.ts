import { describe, expect, it, vi } from "vitest";
import { createNetworkLog } from "./network-log";

const at = (t: number) => () => t;

describe("createNetworkLog", () => {
  it("records an entry and stamps it with the clock", () => {
    const log = createNetworkLog({ now: at(1234) });
    const entry = log.record({
      kind: "update-check",
      label: "Check for updates",
      host: "github.com",
      outcome: "started",
    });
    expect(entry.at).toBe(1234);
    expect(log.entries()).toEqual([entry]);
  });

  it("keeps entries oldest first", () => {
    const log = createNetworkLog({ now: at(0) });
    log.record({ kind: "denied", label: "a", host: "x", outcome: "denied" });
    log.record({ kind: "denied", label: "b", host: "y", outcome: "denied" });
    expect(log.entries().map((e) => e.label)).toEqual(["a", "b"]);
  });

  it("evicts the oldest once it is full", () => {
    const log = createNetworkLog({ capacity: 3, now: at(0) });
    for (const label of ["a", "b", "c", "d"]) {
      log.record({ kind: "denied", label, host: "x", outcome: "denied" });
    }
    expect(log.entries().map((e) => e.label)).toEqual(["b", "c", "d"]);
  });

  // The renderer keys rows by id, so a reused one would collapse two entries.
  it("never reuses an id, even after eviction", () => {
    const log = createNetworkLog({ capacity: 2, now: at(0) });
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(log.record({ kind: "denied", label: "x", host: "x", outcome: "denied" }).id);
    }
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([...ids].toSorted((a, b) => a - b));
  });

  it("tells subscribers about each entry as it lands", () => {
    const log = createNetworkLog({ now: at(0) });
    const seen = vi.fn();
    const stop = log.subscribe(seen);
    log.record({ kind: "denied", label: "a", host: "x", outcome: "denied" });
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    log.record({ kind: "denied", label: "b", host: "x", outcome: "denied" });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("survives a subscriber that throws", () => {
    // A broken listener must not stop the entry being recorded — the log is a
    // diagnostic, and losing it because a window closed mid-send is worse than
    // the error itself.
    const log = createNetworkLog({ now: at(0) });
    log.subscribe(() => {
      throw new Error("window is gone");
    });
    expect(() =>
      log.record({ kind: "denied", label: "a", host: "x", outcome: "denied" }),
    ).not.toThrow();
    expect(log.entries()).toHaveLength(1);
  });

  it("empties on clear without rewinding the ids", () => {
    const log = createNetworkLog({ now: at(0) });
    const first = log.record({ kind: "denied", label: "a", host: "x", outcome: "denied" });
    log.clear();
    expect(log.entries()).toEqual([]);
    const next = log.record({ kind: "denied", label: "b", host: "x", outcome: "denied" });
    expect(next.id).toBeGreaterThan(first.id);
  });
});
