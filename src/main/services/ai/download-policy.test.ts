import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { acceptsResume, checkSpace, planResume, shouldReport } from "./download-policy";

const TOTAL = 1_280_835_840;

describe("planResume", () => {
  it("starts from the beginning with nothing on disk", () => {
    expect(planResume(0, TOTAL)).toEqual({ from: 0 });
  });

  it("resumes from what is already there", () => {
    expect(planResume(1000, TOTAL)).toEqual({ from: 1000, rangeHeader: "bytes=1000-" });
  });

  // A partial at or past the full size is corrupt, not resumable — reasoning
  // about why is more expensive than fetching it again.
  it("starts over when the partial is as big as the whole file", () => {
    expect(planResume(TOTAL, TOTAL)).toEqual({ from: 0 });
    expect(planResume(TOTAL + 1, TOTAL)).toEqual({ from: 0 });
  });

  it("starts over on a nonsense offset", () => {
    expect(planResume(-5, TOTAL)).toEqual({ from: 0 });
  });

  test.prop([fc.nat(), fc.integer({ min: 1, max: 2_000_000_000 })])(
    "never asks to resume past the end",
    (have, total) => {
      const plan = planResume(have, total);
      expect(plan.from).toBeGreaterThanOrEqual(0);
      expect(plan.from).toBeLessThan(total);
    },
  );
});

describe("checkSpace", () => {
  it("allows a download with room to spare", () => {
    expect(checkSpace(TOTAL, 10e9).ok).toBe(true);
  });

  // Filling the disk to the last byte breaks everything else the machine is
  // doing, so finishing exactly is not success.
  it("refuses when the file would only just fit", () => {
    expect(checkSpace(TOTAL, TOTAL + 1000).ok).toBe(false);
  });

  it("says how much is needed and how much there is", () => {
    const result = checkSpace(TOTAL, 100e6);
    expect(result.error).toMatch(/GB/);
    expect(result.error).toMatch(/free/);
  });

  it("only counts what is left to fetch, not the whole file", () => {
    // Most of a resumed download is already on disk and is not needed again.
    expect(checkSpace(1e6, 1e9).ok).toBe(true);
  });
});

describe("acceptsResume", () => {
  it("accepts a plain 200 for a fresh download", () => {
    expect(acceptsResume(200, false)).toBe(true);
  });

  it("accepts a 206 for a resumed one", () => {
    expect(acceptsResume(206, true)).toBe(true);
  });

  // The trap: asking for a range and being handed the whole file. Appending
  // that to an existing partial yields a plausibly-sized file made of two
  // overlapping halves, which fails the hash check with no clue why.
  it("refuses a 200 answer to a range request", () => {
    expect(acceptsResume(200, true)).toBe(false);
  });

  it("refuses anything else", () => {
    for (const status of [204, 301, 403, 404, 416, 500]) {
      expect(acceptsResume(status, false), String(status)).toBe(false);
      expect(acceptsResume(status, true), String(status)).toBe(false);
    }
  });
});

describe("shouldReport", () => {
  it("always reports completion", () => {
    expect(shouldReport(0, TOTAL, TOTAL)).toBe(true);
  });

  it("stays quiet for a trickle", () => {
    expect(shouldReport(0, 1000, TOTAL)).toBe(false);
  });

  it("reports once progress is visible", () => {
    expect(shouldReport(0, 20_000_000, TOTAL)).toBe(true);
  });

  // A 1.3 GB file at one message per chunk would spend the IPC channel on
  // progress nobody can perceive.
  it("reports on the order of a couple of hundred times, not thousands", () => {
    let last = 0;
    let count = 0;
    for (let received = 0; received <= TOTAL; received += 64 * 1024) {
      if (shouldReport(last, received, TOTAL)) {
        last = received;
        count += 1;
      }
    }
    expect(count).toBeLessThan(400);
    expect(count).toBeGreaterThan(50);
  });
});
