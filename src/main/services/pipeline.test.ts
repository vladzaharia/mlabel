import { describe, expect, it } from "vitest";
import { loadConfig } from "@core/config";
import { createDefaultRegistry } from "@core/adapters";
import type { AppConfig } from "@core";
import { configText } from "@test/fixtures/config";
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
