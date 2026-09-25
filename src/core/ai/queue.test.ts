import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { cacheIsValid, horizon, LOOK_AHEAD, schedule, type SchedulerState } from "./queue";

const state = (over: Partial<SchedulerState> = {}): SchedulerState => ({
  index: 0,
  count: 20,
  done: new Set<number>(),
  running: null,
  ...over,
});

describe("horizon", () => {
  it("covers the current record and the look-ahead", () => {
    expect(horizon(5, 100)).toEqual([5, 6, 7, 8]);
  });

  // Whoever is behind you has already read that record; analysing it spends the
  // budget on the one place the answer is certainly too late.
  it("never looks backwards", () => {
    expect(horizon(5, 100).every((i) => i >= 5)).toBe(true);
  });

  it("stops at the end of the file", () => {
    expect(horizon(18, 20)).toEqual([18, 19]);
    expect(horizon(19, 20)).toEqual([19]);
  });

  it("is empty past the end", () => {
    expect(horizon(0, 0)).toEqual([]);
  });
});

describe("schedule", () => {
  it("starts with the record the labeler is looking at", () => {
    expect(schedule(state({ index: 7 })).start).toBe(7);
  });

  it("works ahead once the current record is done", () => {
    expect(schedule(state({ index: 7, done: new Set([7]) })).start).toBe(8);
  });

  it("stays idle when the whole horizon is analysed", () => {
    const done = new Set([7, 8, 9, 10]);
    expect(schedule(state({ index: 7, done })).start).toBeNull();
  });

  it("runs one at a time", () => {
    expect(schedule(state({ index: 7, running: 7 })).start).toBeNull();
  });

  // The worker is a single seat. A job the labeler has left is holding it while
  // the record they are actually looking at waits behind.
  it("abandons work the labeler has navigated away from", () => {
    const result = schedule(state({ index: 40, count: 60, running: 2 }));
    expect(result.abandonRunning).toBe(true);
    expect(result.start).toBe(40);
  });

  it("lets in-horizon work finish", () => {
    expect(schedule(state({ index: 7, running: 9 })).abandonRunning).toBe(false);
  });

  it("does nothing at all for an empty file", () => {
    expect(schedule(state({ count: 0 }))).toEqual({ start: null, abandonRunning: false });
  });

  test.prop([fc.nat(50), fc.nat(50), fc.array(fc.nat(50), { maxLength: 20 })])(
    "never schedules a record outside the horizon",
    (index, count, done) => {
      const result = schedule(state({ index, count, done: new Set(done) }));
      if (result.start === null) return;
      expect(horizon(index, count)).toContain(result.start);
    },
  );

  test.prop([fc.nat(50), fc.array(fc.nat(50), { maxLength: 20 })])(
    "never re-schedules a record already analysed",
    (index, done) => {
      const doneSet = new Set(done);
      const result = schedule(state({ index, count: 60, done: doneSet }));
      if (result.start !== null) expect(doneSet.has(result.start)).toBe(false);
    },
  );

  it("keeps the look-ahead modest, since each one is memory and battery", () => {
    expect(LOOK_AHEAD).toBeLessThanOrEqual(5);
  });
});

describe("cacheIsValid", () => {
  // A cache keyed only by record index would survive a model change and present
  // the small model's opinion under the large one's name.
  it("is invalidated by a change of model", () => {
    expect(cacheIsValid("qwen3.5-2b", "qwen3.5-2b")).toBe(true);
    expect(cacheIsValid("qwen3.5-2b", "gemma-4-e4b")).toBe(false);
  });
});
