import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { loadConfig } from "@core/config";
import { createDefaultRegistry } from "@core/adapters";
import { buildJoin, buildSplit, type NamedText } from "./prepare-pipeline";

const read = (rel: string): string => readFileSync(resolve(rel), "utf8");

const configResult = loadConfig(read("examples/config.jsonc"));
if (!configResult.ok)
  throw new Error(`sample config invalid: ${JSON.stringify(configResult.issues)}`);
const config = configResult.config;
const registry = createDefaultRegistry();

const inputText = read("examples/input.sample.csv");
const goldenText = read("examples/output.golden.csv");
const input: NamedText = { path: "/data/input.sample.csv", text: inputText };

/** Canonical single-file form: what reemit of the whole parsed input produces. */
function canonicalInput(): string {
  const expected = config.input.fields.map((f) => f.name);
  const { document } = registry
    .source("csv")
    .parse({ kind: "content", name: "input.sample.csv", text: inputText }, expected);
  return registry.source("csv").reemit(document.records);
}

describe("buildSplit", () => {
  it("analyzes without splitting when parts is undefined", () => {
    const build = buildSplit(config, input, undefined, registry);
    expect(build.file.ok).toBe(true);
    expect(build.file.rowCount).toBe(3);
    expect(build.parts).toBeUndefined();
  });

  it("splits into contiguous parts that each reparse cleanly", () => {
    const build = buildSplit(config, input, 2, registry);
    expect(build.parts?.map((p) => p.rowCount)).toEqual([2, 1]);
    const expected = config.input.fields.map((f) => f.name);
    for (const part of build.parts!) {
      const { issues, document } = registry
        .source("csv")
        .parse({ kind: "content", name: "part.csv", text: part.content }, expected);
      expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
      expect(document.totalCount).toBe(part.rowCount);
    }
  });

  it("throws RangeError for out-of-range part counts", () => {
    expect(() => buildSplit(config, input, 4, registry)).toThrow(RangeError);
    expect(() => buildSplit(config, input, 0, registry)).toThrow(RangeError);
  });

  it("refuses a file that does not match the input schema", () => {
    const bad: NamedText = { path: "/data/bad.csv", text: "wrong,columns\n1,2\n" };
    const build = buildSplit(config, bad, 2, registry);
    expect(build.file.ok).toBe(false);
    expect(build.file.issues.some((i) => i.severity === "error")).toBe(true);
    expect(build.parts).toBeUndefined();
  });
});

describe("buildJoin (remaining)", () => {
  test.prop([fc.integer({ min: 1, max: 3 })])("split then rejoin restores the input", (parts) => {
    const build = buildSplit(config, input, parts, registry);
    const files: NamedText[] = build.parts!.map((p, i) => ({
      path: `/data/input.sample-part${String(i + 1)}-of-${String(parts)}.csv`,
      text: p.content,
    }));
    const join = buildJoin(config, "remaining", files, registry);
    expect(join.ok).toBe(true);
    expect(join.totalRows).toBe(3);
    expect(join.content).toBe(canonicalInput());
  });

  it("normalizes mixed newline dialects to the first file's, with a warning", () => {
    const build = buildSplit(config, input, 2, registry);
    const [a, b] = build.parts!;
    const join = buildJoin(
      config,
      "remaining",
      [
        { path: "/d/a.csv", text: a!.content },
        { path: "/d/b.csv", text: b!.content.replaceAll("\n", "\r\n") },
      ],
      registry,
    );
    expect(join.ok).toBe(true);
    expect(join.content).toBe(canonicalInput());
    expect(join.content).not.toContain("\r\n");
    expect(
      join.crossFileIssues.some(
        (i) => i.severity === "warning" && /format|newline|delimiter/i.test(i.message),
      ),
    ).toBe(true);
  });

  it("treats a schema-mismatched file as not ok and blocks the join", () => {
    const build = buildSplit(config, input, 2, registry);
    const join = buildJoin(
      config,
      "remaining",
      [
        { path: "/d/a.csv", text: build.parts![0]!.content },
        { path: "/d/bad.csv", text: "wrong,columns\n1,2\n" },
      ],
      registry,
    );
    expect(join.ok).toBe(false);
    expect(join.content).toBeUndefined();
    expect(join.files[1]!.ok).toBe(false);
  });
});

describe("buildJoin (output)", () => {
  it("accepts valid output files and warns about duplicate rows", () => {
    const join = buildJoin(
      config,
      "output",
      [
        { path: "/d/x-output.csv", text: goldenText },
        { path: "/d/y-output.csv", text: goldenText },
      ],
      registry,
    );
    expect(join.ok).toBe(true);
    expect(join.totalRows).toBe(4);
    expect(join.duplicateCount).toBe(2);
    expect(join.crossFileIssues.filter((i) => i.kind === "duplicate")).toHaveLength(2);
    expect(join.content).toBeDefined();
  });

  it("blocks on a row that fails the output schema, naming the row", () => {
    const corrupted = goldenText.replace("positive", "meh");
    const join = buildJoin(
      config,
      "output",
      [{ path: "/d/x-output.csv", text: corrupted }],
      registry,
    );
    expect(join.ok).toBe(false);
    const issue = join.files[0]!.issues.find((i) => i.field === "sentiment");
    expect(issue).toMatchObject({ severity: "error", recordIndex: 0 });
  });

  it("blocks on reordered columns even when the column set matches", () => {
    // Swap the sentiment/quality columns (header + cells): the column SET still
    // matches the schema, but positional cells would misalign on reemit.
    const reordered = goldenText
      .replace("id,sentiment,quality", "id,quality,sentiment")
      .replace("s1,positive,high", "s1,high,positive")
      .replace("s2,negative,low", "s2,low,negative");
    const join = buildJoin(
      config,
      "output",
      [
        { path: "/d/x-output.csv", text: goldenText },
        { path: "/d/y-output.csv", text: reordered },
      ],
      registry,
    );
    expect(join.ok).toBe(false);
    expect(join.content).toBeUndefined();
    expect(
      join.crossFileIssues.some((i) => i.severity === "error" && /column|header/i.test(i.message)),
    ).toBe(true);
  });

  it("fails an empty file list", () => {
    const join = buildJoin(config, "output", [], registry);
    expect(join.ok).toBe(false);
  });
});
