import { describe, expect, it } from "vitest";
import { sessionHasChanges } from "./session";
import type { RecordView, SessionData } from "./types/view";

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
