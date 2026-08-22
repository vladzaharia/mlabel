import Papa from "papaparse";
import type {
  AdapterInput,
  AdapterManifest,
  ParseResult,
  SourceAdapter,
  ValidationIssue,
} from "../interfaces";
import type { RawRecord, SourceDocument } from "../../types/source";
import { coercedToCell, detectNewline, serializeRow, stripBom } from "./internal/format";
import {
  CSV_ADAPTER_ID,
  makeProvenance,
  readProvenance,
  type CsvDocMeta,
} from "./internal/provenance";

interface CsvAdapterConfig {
  delimiter?: string;
  quoteChar?: string;
}

const manifest: AdapterManifest = {
  id: CSV_ADAPTER_ID,
  label: "CSV",
  extensions: [".csv", ".tsv"],
};

function readConfig(adapterConfig: unknown): CsvAdapterConfig {
  return (adapterConfig as CsvAdapterConfig | undefined) ?? {};
}

class CsvSourceAdapter implements SourceAdapter {
  readonly manifest = manifest;

  parse(
    input: AdapterInput,
    expectedFields: readonly string[],
    adapterConfig?: unknown,
  ): ParseResult {
    if (input.kind !== "content") {
      throw new Error("The CSV adapter requires file content (kind: 'content').");
    }
    const cfg = readConfig(adapterConfig);
    const text = stripBom(input.text);
    const newline = detectNewline(text);

    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: "greedy",
      delimiter: cfg.delimiter ?? ",",
      quoteChar: cfg.quoteChar ?? '"',
    });

    const rows = result.data;
    const issues: ValidationIssue[] = [];
    const headerCells = (rows[0] ?? []).map((h) => h.trim());
    const delimiter = result.meta.delimiter || cfg.delimiter || ",";

    validateHeaders(headerCells, expectedFields, issues);
    for (const e of result.errors) {
      issues.push({ kind: "schema", severity: "warning", message: e.message, recordIndex: e.row });
    }

    const docMeta: CsvDocMeta = { headerCells, delimiter, newline };
    const records: RawRecord[] = rows.slice(1).map((cells, index) => {
      const fields: Record<string, string> = {};
      headerCells.forEach((name, i) => {
        fields[name] = cells[i] ?? "";
      });
      return { index, fields, provenance: makeProvenance([...cells], docMeta) };
    });

    const document: SourceDocument = {
      adapterId: CSV_ADAPTER_ID,
      headers: headerCells,
      totalCount: records.length,
      records,
      meta: { delimiter, newline },
    };
    return { document, issues };
  }

  reemit(records: readonly RawRecord[]): string {
    if (records.length === 0) return "";
    const { doc } = readProvenance(records[0]!.provenance);
    const lines = [serializeRow(doc.headerCells, doc.delimiter)];
    for (const record of records) {
      const { cells } = readProvenance(record.provenance);
      lines.push(serializeRow(cells, doc.delimiter));
    }
    return lines.join(doc.newline) + doc.newline;
  }
}

function validateHeaders(
  headers: readonly string[],
  expected: readonly string[],
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const h of headers) {
    if (seen.has(h)) {
      issues.push({
        kind: "duplicate",
        severity: "warning",
        field: h,
        message: `Duplicate column "${h}".`,
      });
    }
    seen.add(h);
  }
  const headerSet = new Set(headers);
  for (const field of expected) {
    if (!headerSet.has(field)) {
      issues.push({
        kind: "missing",
        severity: "error",
        field,
        message: `Required input column "${field}" is missing from the file.`,
      });
    }
  }
  const expectedSet = new Set(expected);
  for (const h of headers) {
    if (!expectedSet.has(h)) {
      issues.push({
        kind: "extra",
        severity: "warning",
        field: h,
        message: `Column "${h}" is not in the input schema (it will be ignored).`,
      });
    }
  }
}

// Re-export the cell serializer so the sink shares one implementation.
export { coercedToCell };
export const csvSourceAdapter: SourceAdapter = new CsvSourceAdapter();
