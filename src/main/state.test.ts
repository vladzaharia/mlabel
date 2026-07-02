import { describe, expect, it } from "vitest";
import { isRevealable } from "./state";

describe("isRevealable", () => {
  it("returns true for a path present in the set", () => {
    const set = new Set(["/tmp/data-output.csv"]);
    expect(isRevealable("/tmp/data-output.csv", set)).toBe(true);
  });

  it("returns false for a path not in the set", () => {
    const set = new Set(["/tmp/data-output.csv"]);
    expect(isRevealable("/tmp/data-remaining.csv", set)).toBe(false);
  });

  it("returns false for an empty set", () => {
    expect(isRevealable("/tmp/anything.csv", new Set())).toBe(false);
  });

  it("is case-sensitive (exact match)", () => {
    const set = new Set(["/tmp/Data-Output.csv"]);
    expect(isRevealable("/tmp/data-output.csv", set)).toBe(false);
    expect(isRevealable("/tmp/Data-Output.csv", set)).toBe(true);
  });

  it("refuses a path with a common prefix but different suffix", () => {
    const set = new Set(["/tmp/data-output.csv"]);
    expect(isRevealable("/tmp/data-output.csv.evil", set)).toBe(false);
    expect(isRevealable("/tmp/data-output", set)).toBe(false);
  });
});
