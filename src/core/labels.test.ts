import { describe, expect, it } from "vitest";
import {
  resolveLabelValues,
  sessionAnswered,
  sessionFields,
  stampLabelTime,
  timestampField,
  toggleChoice,
} from "./labels";
import { evaluateRecord } from "./completion";
import { buildConfig } from "@test/fixtures/config";
import type { LabelMap } from "./types/view";

const config = buildConfig({
  input: ["id"],
  output: [
    { name: "id", kind: "copied" },
    { name: "annotator", kind: "session" },
    { name: "labeledAt", kind: "timestamp" },
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
  ],
});
const outputFields = config.output.fields;

/** A frozen clock — never read the wall clock in a test that touches export. */
const FIXED = new Date("2026-08-22T09:30:00.000Z");
const clock = (): Date => FIXED;

describe("resolveLabelValues", () => {
  it("fills session-scoped fields from the session answers", () => {
    const merged = resolveLabelValues(
      { id: "1", verdict: "good" },
      { annotator: "vlad" },
      outputFields,
    );
    expect(merged["annotator"]).toBe("vlad");
    expect(merged["verdict"]).toBe("good");
  });

  it("leaves per-record fields alone", () => {
    const merged = resolveLabelValues({ verdict: "good" }, { verdict: "bad" }, outputFields);
    expect(merged["verdict"]).toBe("good");
  });

  it("is a no-op without a session", () => {
    expect(resolveLabelValues({ verdict: "good" }, undefined, outputFields)).toEqual({
      verdict: "good",
    });
  });

  it("does not mutate its input", () => {
    const record = { verdict: "good" };
    resolveLabelValues(record, { annotator: "vlad" }, outputFields);
    expect(record).toEqual({ verdict: "good" });
  });

  // The whole reason this function exists: an unanswered required session field
  // must make the record incomplete everywhere, not just at export time.
  it("decides completeness the same way the export will", () => {
    const record = { id: "1", verdict: "good" };
    expect(
      evaluateRecord(resolveLabelValues(record, {}, outputFields), outputFields).status,
    ).not.toBe("complete");
    expect(
      evaluateRecord(resolveLabelValues(record, { annotator: "vlad" }, outputFields), outputFields)
        .status,
    ).toBe("complete");
  });
});

describe("sessionFields / sessionAnswered", () => {
  it("finds the fields asked once up front", () => {
    expect(sessionFields(outputFields).map((f) => f.name)).toEqual(["annotator"]);
  });

  it("is unanswered until every required session field is valid", () => {
    expect(sessionAnswered({}, outputFields)).toBe(false);
    expect(sessionAnswered({ annotator: "vlad" }, outputFields)).toBe(true);
  });

  it("is answered trivially when the config asks nothing", () => {
    const plain = buildConfig({ output: [{ name: "verdict", kind: "choice", choices: ["a"] }] });
    expect(sessionAnswered({}, plain.output.fields)).toBe(true);
  });
});

describe("stampLabelTime", () => {
  const answered: LabelMap = { annotator: "vlad" };

  it("finds the configured timestamp field", () => {
    expect(timestampField(outputFields)?.name).toBe("labeledAt");
  });

  it("stamps once the record is complete", () => {
    const stamped = stampLabelTime({ id: "1", verdict: "good" }, answered, outputFields, clock);
    expect(stamped["labeledAt"]).toEqual(FIXED);
  });

  it("does not stamp a record that is still incomplete", () => {
    const labels: LabelMap = { id: "1" };
    expect(stampLabelTime(labels, answered, outputFields, clock)).toBe(labels);
  });

  // A record whose only missing piece is a session answer must not stamp, or
  // the timestamp would claim work that had not happened yet.
  it("waits for the session answers too", () => {
    const labels: LabelMap = { id: "1", verdict: "good" };
    expect(stampLabelTime(labels, {}, outputFields, clock)).toBe(labels);
  });

  it("re-stamps on a later edit", () => {
    const first = stampLabelTime({ id: "1", verdict: "good" }, answered, outputFields, clock);
    const later = new Date("2026-08-22T11:00:00.000Z");
    const second = stampLabelTime(
      { ...first, verdict: "bad" },
      answered,
      outputFields,
      () => later,
    );
    expect(second["labeledAt"]).toEqual(later);
  });

  it("returns the same object when no timestamp field is configured", () => {
    const plain = buildConfig({ output: [{ name: "verdict", kind: "choice", choices: ["a"] }] });
    const labels: LabelMap = { verdict: "a" };
    expect(stampLabelTime(labels, {}, plain.output.fields, clock)).toBe(labels);
  });

  // Stored as a real Date so the CSV sink serializes ISO-8601 with milliseconds
  // and the session reviver keeps it typed across a resume.
  it("stores a Date, not a pre-formatted string", () => {
    const stamped = stampLabelTime({ id: "1", verdict: "good" }, answered, outputFields, clock);
    expect(stamped["labeledAt"]).toBeInstanceOf(Date);
  });
});

describe("toggleChoice", () => {
  const order = ["billing", "outage", "howto"] as const;

  it("adds a choice to an empty value", () => {
    expect(toggleChoice(null, "outage", order)).toEqual(["outage"]);
  });

  it("removes a choice that was already selected", () => {
    expect(toggleChoice(["billing", "outage"], "billing", order)).toEqual(["outage"]);
  });

  // Click order must not leak into the exported cell, or two labelers who
  // picked the same set produce different rows.
  it("keeps declaration order regardless of selection order", () => {
    expect(toggleChoice(["howto"], "billing", order)).toEqual(["billing", "howto"]);
  });

  it("returns null when the last choice is removed", () => {
    expect(toggleChoice(["billing"], "billing", order)).toBeNull();
  });

  it("treats a non-array value as no selection", () => {
    expect(toggleChoice("billing", "outage", order)).toEqual(["outage"]);
  });
});
