import { describe, expect, it } from "vitest";
import { effectiveUpdateChecks } from "./network-prefs";

describe("effectiveUpdateChecks", () => {
  it("allows checks only when both the config and the labeler do", () => {
    expect(effectiveUpdateChecks(true, true)).toBe(true);
  });

  it("honours a labeler turning checks off", () => {
    expect(effectiveUpdateChecks(true, false)).toBe(false);
  });

  // The whole reason this function exists rather than being inlined.
  it("a user setting can never enable what the config forbade", () => {
    expect(effectiveUpdateChecks(false, true)).toBe(false);
    expect(effectiveUpdateChecks(false, false)).toBe(false);
  });
});
