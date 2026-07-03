import { describe, expect, it } from "vitest";
import { partFileNames } from "./prepare-names";

describe("partFileNames", () => {
  it("names contiguous parts from the source basename", () => {
    expect(partFileNames("/data/input.csv", 3)).toEqual([
      "input-part1-of-3.csv",
      "input-part2-of-3.csv",
      "input-part3-of-3.csv",
    ]);
  });

  it("preserves the source extension", () => {
    expect(partFileNames("/data/input.tsv", 2)).toEqual([
      "input-part1-of-2.tsv",
      "input-part2-of-2.tsv",
    ]);
  });

  it("strips an existing part suffix so re-splits don't stack", () => {
    expect(partFileNames("/data/input-part2-of-5.csv", 2)).toEqual([
      "input-part1-of-2.csv",
      "input-part2-of-2.csv",
    ]);
  });

  it("handles Windows separators and multi-dot names", () => {
    expect(partFileNames("C:\\data\\report.final.csv", 2)).toEqual([
      "report.final-part1-of-2.csv",
      "report.final-part2-of-2.csv",
    ]);
  });

  it("handles names without an extension", () => {
    expect(partFileNames("/data/input", 2)).toEqual(["input-part1-of-2", "input-part2-of-2"]);
  });
});
