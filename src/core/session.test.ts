import { describe, expect, it } from "vitest";
import { test as fcTest, fc } from "@fast-check/vitest";
import { fingerprintsEqual, reviveLabelMap, sessionHasChanges } from "./session";
import { evaluateRecord } from "./completion";
import type { LabelMap, RecordView, SessionData, SourceFingerprint } from "./types/view";
import { buildConfig } from "@test/fixtures/config";

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

/** Exactly what session-store does to a label map on the way to disk and back. */
const roundTrip = (labels: LabelMap): LabelMap => JSON.parse(JSON.stringify(labels)) as LabelMap;

describe("reviveLabelMap", () => {
  // Sessions are persisted with plain JSON.stringify and read back with plain
  // JSON.parse, so a Date is written as an ISO string and returns as a string.
  // Nothing re-coerced it, so `value instanceof Date` failed and a finished
  // record silently reverted to incomplete on resume.
  const config = buildConfig({
    output: [
      { name: "reviewedOn", kind: "date" },
      { name: "score", kind: "number", min: 0, max: 10 },
      { name: "flag", kind: "checkbox" },
      { name: "verdict", kind: "choice", choices: ["good", "bad"] },
      { name: "note", required: false },
    ],
  });

  const complete: LabelMap = {
    reviewedOn: new Date("2026-06-01T00:00:00.000Z"),
    score: 7,
    flag: true,
    verdict: "good",
    note: "ok",
  };

  it("restores a Date from the ISO string a JSON round-trip leaves behind", () => {
    const revived = reviveLabelMap(roundTrip(complete), config.output.fields);
    expect(revived["reviewedOn"]).toBeInstanceOf(Date);
    expect((revived["reviewedOn"] as Date).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("leaves values that survive JSON untouched", () => {
    const revived = reviveLabelMap(roundTrip(complete), config.output.fields);
    expect(revived["score"]).toBe(7);
    expect(revived["flag"]).toBe(true);
    expect(revived["verdict"]).toBe("good");
    expect(revived["note"]).toBe("ok");
  });

  it("preserves nulls for unanswered fields", () => {
    const revived = reviveLabelMap(roundTrip({ ...complete, note: null }), config.output.fields);
    expect(revived["note"]).toBeNull();
  });

  it("keeps an unparseable value rather than destroying it", () => {
    const revived = reviveLabelMap({ reviewedOn: "not-a-date" }, config.output.fields);
    expect(revived["reviewedOn"]).toBe("not-a-date");
  });

  // The bug in one assertion: this is what a labeler experienced after resuming.
  it("keeps a complete record complete across a save/resume round-trip", () => {
    expect(evaluateRecord(complete, config.output.fields).status).toBe("complete");

    // Without revival the round-tripped map reports "Must be a date."
    expect(evaluateRecord(roundTrip(complete), config.output.fields).status).not.toBe("complete");

    const revived = reviveLabelMap(roundTrip(complete), config.output.fields);
    expect(evaluateRecord(revived, config.output.fields).status).toBe("complete");
  });
});
