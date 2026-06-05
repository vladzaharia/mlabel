import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@core/config";
import { createDefaultRegistry } from "@core/adapters";
import type { LabelMap } from "@core";
import { buildExport, buildRecordViews } from "./pipeline";

const read = (rel: string): string => readFileSync(resolve(rel), "utf8");

describe("examples/ end-to-end pipeline", () => {
  const configResult = loadConfig(read("examples/config.jsonc"));
  if (!configResult.ok)
    throw new Error(`sample config invalid: ${JSON.stringify(configResult.issues)}`);
  const config = configResult.config;
  const registry = createDefaultRegistry();

  const expected = config.input.fields.map((f) => f.name);
  const { document, issues } = registry
    .source("csv")
    .parse(
      { kind: "content", name: "input.sample.csv", text: read("examples/input.sample.csv") },
      expected,
    );

  it("loads the sample config and parses the sample CSV without schema errors", () => {
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(document.totalCount).toBe(3);
  });

  it("coerces composite cells (array/map/object) for display", () => {
    const { records } = buildRecordViews(config, document);
    const r0 = records[0]!;
    expect(r0.inputValues["tags"]).toEqual(["geo", "easy"]);
    expect(r0.inputValues["tokenCounts"]).toEqual({ prompt: 7, response: 1 });
    expect(r0.inputValues["checks"]).toEqual([
      { name: "toxicity", passed: true },
      { name: "pii", passed: true },
    ]);
    expect(r0.inputValues["annotators"]).toEqual({ alice: { role: "lead", confidence: 0.9 } });
    expect(r0.coercionErrors).toHaveLength(0);
  });

  it("exports complete records to match the golden file; leaves the rest as remaining", () => {
    const { inputValues } = buildRecordViews(config, document);
    const labels: Record<number, LabelMap> = {
      0: {
        sentiment: "positive",
        quality: "high",
        needsReview: false,
        rating: 5,
        confidence: 0.9,
        reviewedOn: new Date("2026-06-01T00:00:00.000Z"),
        notes: "clear",
      },
      1: { sentiment: "negative", quality: "low", needsReview: true, rating: 2 },
      // record 2 is left unlabeled → remaining
    };

    const artifacts = buildExport(config, document, inputValues, labels, registry);
    expect(artifacts.completeCount).toBe(2);
    expect(artifacts.remainingCount).toBe(1);
    expect(artifacts.outputContent).toBe(read("examples/output.golden.csv"));

    // The remaining file re-loads cleanly and contains the third record verbatim.
    const reparsed = registry
      .source("csv")
      .parse({ kind: "content", name: "rem.csv", text: artifacts.remainingContent! }, expected);
    expect(reparsed.document.records).toHaveLength(1);
    expect(reparsed.document.records[0]?.fields["id"]).toBe("s3");
  });
});
