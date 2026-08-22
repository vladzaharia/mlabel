import { describe, expect, it } from "vitest";
import { loadConfig } from "@core/config";
import { createDefaultRegistry } from "@core/adapters";
import type { AppConfig } from "@core";
import { configObject, configText } from "@test/fixtures/config";
import { buildExport, buildRecordViews } from "./pipeline";

const CONFIG_TEXT = configText({
  input: [{ name: "id", title: true }, "text", { name: "score", type: { type: "number" } }],
  output: [
    { name: "id", kind: "copied" },
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
    { name: "note", required: false },
  ],
});

function loadValidConfig(): AppConfig {
  const result = loadConfig(CONFIG_TEXT);
  if (!result.ok) throw new Error(`config invalid: ${JSON.stringify(result.issues)}`);
  return result.config;
}

const INPUT_CSV = "id,text,score\n1,hello,5\n2,world,9\n3,bad-score,notanumber\n";

describe("input + export pipeline (end-to-end, no Electron)", () => {
  const config = loadValidConfig();
  const registry = createDefaultRegistry();
  const { document } = registry
    .source("csv")
    .parse({ kind: "content", name: "in.csv", text: INPUT_CSV }, ["id", "text", "score"]);

  it("coerces input fields and reports per-record coercion errors", () => {
    const { records, inputValues } = buildRecordViews(config, document);
    expect(records).toHaveLength(3);
    expect(inputValues.get(0)).toEqual({ id: "1", text: "hello", score: 5 });
    // The "id" output field is auto-copied (hidden, same name).
    expect(records[0]?.labelValues["id"]).toBe("1");
    expect(records[0]?.labelValues["verdict"]).toBeNull();
    // Record 2 has a non-numeric score → a coercion error on that field.
    expect(records[2]?.coercionErrors.some((e) => e.field === "score")).toBe(true);
  });

  it("exports only complete records and re-emits the rest as remaining", () => {
    const { inputValues } = buildRecordViews(config, document);
    const labels = {
      0: { verdict: "good" }, // complete
      1: { verdict: "bad", note: "hmm" }, // complete
      // record 2 left unlabeled → remaining
    };
    const artifacts = buildExport(config, document, inputValues, labels, registry);

    expect(artifacts.completeCount).toBe(2);
    expect(artifacts.remainingCount).toBe(1);
    expect(artifacts.outputContent).toBe("id,verdict,note\n1,good,\n2,bad,hmm\n");

    // The remaining file re-loads cleanly as an input file.
    expect(artifacts.remainingContent).toBeDefined();
    const reparsed = registry
      .source("csv")
      .parse({ kind: "content", name: "rem.csv", text: artifacts.remainingContent! }, [
        "id",
        "text",
        "score",
      ]);
    expect(reparsed.document.records).toHaveLength(1);
    expect(reparsed.document.records[0]?.fields).toEqual({
      id: "3",
      text: "bad-score",
      score: "notanumber",
    });
  });

  it("writes no remaining content when everything is complete", () => {
    const { inputValues } = buildRecordViews(config, document);
    const labels = { 0: { verdict: "good" }, 1: { verdict: "good" }, 2: { verdict: "good" } };
    const artifacts = buildExport(config, document, inputValues, labels, registry);
    expect(artifacts.remainingCount).toBe(0);
    expect(artifacts.remainingContent).toBeUndefined();
  });
});

describe("buildExport with session answers and a timestamp", () => {
  const CONFIG = configText({
    input: ["id", "text"],
    output: [
      { name: "id", kind: "copied" },
      { name: "annotator", kind: "session" },
      { name: "labeledAt", kind: "timestamp" },
      { name: "verdict", kind: "choice", choices: ["good", "bad"] },
    ],
  });

  function load(): AppConfig {
    const result = loadConfig(CONFIG);
    if (!result.ok) throw new Error(`config invalid: ${JSON.stringify(result.issues)}`);
    return result.config;
  }

  const csv = "id,text\n1,hello\n2,world\n";
  const registry2 = createDefaultRegistry();

  function artifacts(
    labels: Record<number, Record<string, unknown>>,
    prefill?: Record<string, unknown>,
  ) {
    const config = load();
    const { document } = registry2
      .source("csv")
      .parse({ kind: "content", name: "in.csv", text: csv }, ["id", "text"]);
    const { inputValues } = buildRecordViews(config, document);
    return buildExport(config, document, inputValues, labels as never, registry2, prefill as never);
  }

  it("writes the session answer onto every complete row", () => {
    const stamp = new Date("2026-08-22T09:30:00.000Z");
    const out = artifacts(
      { 0: { verdict: "good", labeledAt: stamp }, 1: { verdict: "bad", labeledAt: stamp } },
      { annotator: "vlad" },
    );
    expect(out.completeCount).toBe(2);
    const lines = out.outputContent.trim().split("\n");
    expect(lines[0]).toBe("id,annotator,labeledAt,verdict");
    expect(lines[1]).toContain("vlad");
    expect(lines[2]).toContain("vlad");
  });

  // Without the merge a required session field reads as missing, so every row
  // would land in the remaining file while the export reported success.
  it("counts nothing as complete when a required session answer is missing", () => {
    const out = artifacts({ 0: { verdict: "good" }, 1: { verdict: "bad" } }, {});
    expect(out.completeCount).toBe(0);
    expect(out.remainingCount).toBe(2);
  });

  it("serializes the timestamp as ISO-8601 with milliseconds", () => {
    const out = artifacts(
      { 0: { verdict: "good", labeledAt: new Date("2026-08-22T09:30:00.000Z") } },
      { annotator: "vlad" },
    );
    expect(out.outputContent).toContain("2026-08-22T09:30:00.000Z");
  });

  // The remaining file re-emits raw source rows, so nothing the labeler or the
  // app added can leak into it — it has to stay re-loadable as input.
  it("keeps session and timestamp columns out of the remaining file", () => {
    const out = artifacts({ 0: { verdict: "good" } }, { annotator: "vlad" });
    expect(out.remainingContent).toBeDefined();
    expect(out.remainingContent).not.toContain("vlad");
    expect(out.remainingContent).not.toContain("labeledAt");
    expect(out.remainingContent?.trim().split("\n")[0]).toBe("id,text");
  });
});

/**
 * The guarantee display rules exist under: they may tint a value and explain
 * why, and they may not change one byte of what gets written. Enforced
 * structurally by keeping `decorations.ts` off the export path — and here, by
 * comparing the artifacts a rules-carrying config produces against one without.
 */
describe("display rules never reach the exported bytes", () => {
  const base = {
    input: ["id", "text"],
    output: [
      { name: "id", kind: "copied" as const },
      { name: "verdict", kind: "choice" as const, choices: ["good", "bad"] },
    ],
  };

  const RULES = [
    {
      name: "canned",
      when: { op: "matches", field: "text", pattern: "^hello" },
      appliesTo: ["text"],
      style: { tone: "muted", note: "Canned." },
    },
    {
      name: "mismatch",
      when: { op: "ne", field: "id", otherField: "text" },
      appliesTo: ["id", "text"],
      style: { tone: "danger" },
    },
  ];

  function build(withRules: boolean) {
    const object = configObject({ ...base }) as Record<string, any>;
    if (withRules) object["input"].rules = RULES;
    const parsed = loadConfig(JSON.stringify(object));
    if (!parsed.ok) throw new Error(`config invalid: ${JSON.stringify(parsed.issues)}`);

    const reg = createDefaultRegistry();
    const { document } = reg
      .source("csv")
      .parse({ kind: "content", name: "in.csv", text: "id,text\n1,hello\n2,world\n" }, [
        "id",
        "text",
      ]);
    const { inputValues } = buildRecordViews(parsed.config, document);
    return buildExport(parsed.config, document, inputValues, { 0: { verdict: "good" } }, reg);
  }

  it("produces byte-identical output with and without rules", () => {
    expect(build(true).outputContent).toBe(build(false).outputContent);
  });

  it("produces byte-identical remaining content with and without rules", () => {
    expect(build(true).remainingContent).toBe(build(false).remainingContent);
  });

  it("splits records the same way with and without rules", () => {
    expect(build(true).completeCount).toBe(build(false).completeCount);
    expect(build(true).remainingCount).toBe(build(false).remainingCount);
  });
});
