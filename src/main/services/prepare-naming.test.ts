import { describe, expect, it } from "vitest";
import { defaultJoinFileName, splitTargetPaths } from "./prepare-naming";

describe("splitTargetPaths", () => {
  it("names contiguous parts next to the source file", () => {
    expect(splitTargetPaths("/data/input.csv", 3)).toEqual([
      "/data/input-part1-of-3.csv",
      "/data/input-part2-of-3.csv",
      "/data/input-part3-of-3.csv",
    ]);
  });

  it("preserves the source extension", () => {
    expect(splitTargetPaths("/data/input.tsv", 2)).toEqual([
      "/data/input-part1-of-2.tsv",
      "/data/input-part2-of-2.tsv",
    ]);
  });

  it("strips an existing part suffix so re-splits don't stack", () => {
    expect(splitTargetPaths("/data/input-part2-of-5.csv", 2)).toEqual([
      "/data/input-part1-of-2.csv",
      "/data/input-part2-of-2.csv",
    ]);
  });
});

describe("defaultJoinFileName", () => {
  it("derives the output join name from the first file", () => {
    expect(defaultJoinFileName("output", "/x/data-part1-of-3-output.csv")).toBe(
      "data-output-joined.csv",
    );
    expect(defaultJoinFileName("output", "/x/data-output.csv")).toBe("data-output-joined.csv");
  });

  it("derives the remaining join name from the first file", () => {
    expect(defaultJoinFileName("remaining", "/x/data-part2-of-3-remaining.csv")).toBe(
      "data-remaining-joined.csv",
    );
    expect(defaultJoinFileName("remaining", "/x/data.csv")).toBe("data-remaining-joined.csv");
  });

  it("keeps the first file's extension", () => {
    expect(defaultJoinFileName("output", "/x/data-output.tsv")).toBe("data-output-joined.tsv");
  });
});
