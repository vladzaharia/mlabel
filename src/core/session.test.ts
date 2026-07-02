import { describe, expect, it } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import { fingerprintsEqual, sessionHasChanges } from "./session";
import type { RecordView, SessionData, SourceFingerprint } from "./types/view";

function record(index: number, labelValues: RecordView["labelValues"]): RecordView {
  return { index, inputValues: {}, labelValues, coercionErrors: [] };
}

function session(labels: SessionData["labels"], index = 0): SessionData {
  return { configPath: "c", inputPath: "i", index, labels };
}

describe("sessionHasChanges", () => {
  it("is false when saved labels match the freshly seeded baseline", () => {
    const records = [record(0, { verdict: null, id: "1" }), record(1, { verdict: null, id: "2" })];
    const resume = session({ 0: { verdict: null, id: "1" }, 1: { verdict: null, id: "2" } });
    expect(sessionHasChanges(resume, records)).toBe(false);
  });

  it("is false for an empty session", () => {
    const records = [record(0, { verdict: null })];
    expect(sessionHasChanges(session({}), records)).toBe(false);
  });

  it("is true when a user label differs from the seeded value", () => {
    const records = [record(0, { verdict: null, id: "1" })];
    const resume = session({ 0: { verdict: "good", id: "1" } });
    expect(sessionHasChanges(resume, records)).toBe(true);
  });

  it("ignores auto-seeded values that were not changed", () => {
    const records = [record(0, { verdict: null, copied: "x" })];
    const resume = session({ 0: { verdict: null, copied: "x" } });
    expect(sessionHasChanges(resume, records)).toBe(false);
  });

  it("deep-compares array and object label values", () => {
    const records = [record(0, { tags: ["a"], meta: { k: 1 } })];
    expect(sessionHasChanges(session({ 0: { tags: ["a"], meta: { k: 1 } } }), records)).toBe(false);
    expect(sessionHasChanges(session({ 0: { tags: ["a", "b"], meta: { k: 1 } } }), records)).toBe(
      true,
    );
  });

  it("treats Date values by instant, not identity", () => {
    const records = [record(0, { when: new Date("2026-01-01") })];
    const same = session({ 0: { when: new Date("2026-01-01") } });
    const diff = session({ 0: { when: new Date("2026-02-02") } });
    expect(sessionHasChanges(same, records)).toBe(false);
    expect(sessionHasChanges(diff, records)).toBe(true);
  });
});

function fp(override: Partial<SourceFingerprint> = {}): SourceFingerprint {
  return { size: 1024, mtimeMs: 1_700_000_000_000, sha256: "abc123", ...override };
}

describe("fingerprintsEqual", () => {
  it("returns true when size and sha256 are identical", () => {
    expect(fingerprintsEqual(fp(), fp())).toBe(true);
  });

  it("returns false when size differs", () => {
    expect(fingerprintsEqual(fp({ size: 1024 }), fp({ size: 1025 }))).toBe(false);
  });

  it("returns false when sha256 differs", () => {
    expect(fingerprintsEqual(fp({ sha256: "aaa" }), fp({ sha256: "bbb" }))).toBe(false);
  });

  it("ignores mtimeMs — byte-identical re-download must not read as stale", () => {
    const a = fp({ mtimeMs: 1_000_000 });
    const b = fp({ mtimeMs: 9_999_999 });
    expect(fingerprintsEqual(a, b)).toBe(true);
  });

  fcTest.prop([
    fc.record({
      size: fc.integer({ min: 0 }),
      mtimeMs: fc.float(),
      sha256: fc.stringMatching(/^[0-9a-f]{64}$/),
    }),
    fc.record({
      size: fc.integer({ min: 0 }),
      mtimeMs: fc.float(),
      sha256: fc.stringMatching(/^[0-9a-f]{64}$/),
    }),
  ])("property: equal iff size AND sha256 both match (fast-check)", (a, b) => {
    const expected = a.size === b.size && a.sha256 === b.sha256;
    expect(fingerprintsEqual(a, b)).toBe(expected);
  });
});
