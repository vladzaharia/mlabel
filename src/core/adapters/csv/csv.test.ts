import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import { csvSourceAdapter } from "./source";
import { csvSinkAdapter } from "./sink";
import type { AdapterInput } from "../interfaces";
import type { LabeledRecord } from "../../types/labeling";

const content = (text: string): AdapterInput => ({ kind: "content", name: "in.csv", text });

describe("CSV source adapter — parsing", () => {
  it("parses rows into header-keyed fields", () => {
    const { document, issues } = csvSourceAdapter.parse(content("id,name\n1,Ada\n2,Linus\n"), [
      "id",
      "name",
    ]);
    expect(issues).toHaveLength(0);
    expect(document.headers).toEqual(["id", "name"]);
    expect(document.totalCount).toBe(2);
    expect(document.records[0]?.fields).toEqual({ id: "1", name: "Ada" });
  });

  it("strips a UTF-8 BOM before reading headers", () => {
    const { issues } = csvSourceAdapter.parse(content("﻿id,name\n1,Ada\n"), ["id", "name"]);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("handles quoted cells with embedded commas and quotes", () => {
    const { document } = csvSourceAdapter.parse(content('id,note\n1,"a, ""b"", c"\n'), [
      "id",
      "note",
    ]);
    expect(document.records[0]?.fields["note"]).toBe('a, "b", c');
  });

  it("errors on a missing required column, warns on an extra one", () => {
    const { issues } = csvSourceAdapter.parse(content("id,extra\n1,x\n"), ["id", "name"]);
    expect(
      issues.some((i) => i.kind === "missing" && i.severity === "error" && i.field === "name"),
    ).toBe(true);
    expect(
      issues.some((i) => i.kind === "extra" && i.severity === "warning" && i.field === "extra"),
    ).toBe(true);
  });

  it("warns on duplicate headers", () => {
    const { issues } = csvSourceAdapter.parse(content("id,id\n1,2\n"), ["id"]);
    expect(issues.some((i) => i.kind === "duplicate")).toBe(true);
  });

  it("respects a configured delimiter (TSV)", () => {
    const { document } = csvSourceAdapter.parse(content("id\tname\n1\tAda\n"), ["id", "name"], {
      delimiter: "\t",
    });
    expect(document.records[0]?.fields).toEqual({ id: "1", name: "Ada" });
  });
});

describe("CSV source adapter — reemit (remaining file)", () => {
  it("re-emits records as a re-loadable CSV", () => {
    const { document } = csvSourceAdapter.parse(content('id,note\n1,"a,b"\n2,plain\n'), [
      "id",
      "note",
    ]);
    const remaining = csvSourceAdapter.reemit([document.records[1]!]);
    const reparsed = csvSourceAdapter.parse(content(remaining), ["id", "note"]);
    expect(reparsed.document.records).toHaveLength(1);
    expect(reparsed.document.records[0]?.fields).toEqual({ id: "2", note: "plain" });
  });

  it("returns an empty string when there are no records", () => {
    expect(csvSourceAdapter.reemit([])).toBe("");
  });

  test.prop([fc.array(fc.record({ id: fc.string(), note: fc.string() }), { minLength: 1 })])(
    "round-trips arbitrary cell data through parse → reemit → parse",
    (rows) => {
      const header = "id,note\n";
      const body = rows.map((r) => `${csvCell(r.id)},${csvCell(r.note)}`).join("\n");
      const parsed = csvSourceAdapter.parse(content(header + body + "\n"), ["id", "note"]);
      const remaining = csvSourceAdapter.reemit(parsed.document.records);
      const reparsed = csvSourceAdapter.parse(content(remaining), ["id", "note"]);
      expect(reparsed.document.records.map((r) => r.fields)).toEqual(
        parsed.document.records.map((r) => r.fields),
      );
    },
  );
});

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

describe("CSV sink adapter — output generation", () => {
  it("writes columns in schema order with canonical cell serialization", () => {
    const records: LabeledRecord[] = [
      {
        index: 0,
        inputValues: {},
        labelValues: { id: "1", verdict: "good", score: 9, flag: true },
        status: "complete",
        provenance: { __adapter: "csv", __raw: {} },
      },
    ];
    const out = csvSinkAdapter.serialize(records, [
      { name: "id" },
      { name: "verdict" },
      { name: "score" },
      { name: "flag" },
    ]);
    expect(out).toBe("id,verdict,score,flag\n1,good,9,true\n");
  });

  it("serializes composite values as JSON and quotes when needed", () => {
    const records: LabeledRecord[] = [
      {
        index: 0,
        inputValues: {},
        labelValues: { tags: ["a", "b"], note: "x,y" },
        status: "complete",
        provenance: { __adapter: "csv", __raw: {} },
      },
    ];
    const out = csvSinkAdapter.serialize(records, [{ name: "tags" }, { name: "note" }]);
    expect(out).toBe('tags,note\n"[""a"",""b""]","x,y"\n');
  });
});
