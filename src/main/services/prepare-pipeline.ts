import { extname } from "node:path";
import {
  headersMatch,
  findDuplicateRecords,
  splitRecords,
  validateInputRecord,
  validateOutputRecord,
  type AppConfig,
  type JoinKind,
  type PrepareFileInfo,
  type RawRecord,
  type SourceDocument,
  type ValidationIssue,
} from "@core";
import type { AdapterRegistry, SourceAdapter } from "@core/adapters";

/** Pure (no fs, no Electron) Prepare pipeline — main reads files, this decides. */

export interface NamedText {
  path: string;
  text: string;
}

export interface SplitBuild {
  file: PrepareFileInfo;
  /** Present only when a valid `parts` was requested and the file is ok. */
  parts?: { content: string; rowCount: number }[];
}

export interface JoinBuild {
  files: PrepareFileInfo[];
  crossFileIssues: ValidationIssue[];
  totalRows: number;
  duplicateCount: number;
  ok: boolean;
  /** Reemit of all records in order, in the first file's dialect; ok only. */
  content?: string;
}

function hasError(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

function sourceFor(registry: AdapterRegistry, path: string, adapterId: string): SourceAdapter {
  return registry.sourceForExtension(extname(path)) ?? registry.source(adapterId);
}

function parseFile(
  config: AppConfig,
  kind: JoinKind | "input",
  file: NamedText,
  registry: AdapterRegistry,
): { document: SourceDocument; info: PrepareFileInfo } {
  const side = kind === "output" ? config.output : config.input;
  const adapter = sourceFor(registry, file.path, side.adapterId);
  const expected = side.fields.map((f) => f.name);
  const { document, issues } = adapter.parse(
    { kind: "content", name: file.path, text: file.text },
    expected,
    side.adapterConfig,
  );

  document.records.forEach((record, i) => {
    if (kind === "output") issues.push(...validateOutputRecord(record, config, i));
    else issues.push(...validateInputRecord(record, config, i));
  });

  return {
    document,
    info: {
      path: file.path,
      rowCount: document.totalCount,
      issues,
      ok: !hasError(issues),
    },
  };
}

/**
 * Parse one input file against the input schema and, when `parts` is given and
 * the file is valid, split it into contiguous chunks — each chunk re-emitted in
 * the source dialect with the header row. Throws RangeError for `parts` outside
 * `1..rowCount` (the UI clamps; this is defense in depth).
 */
export function buildSplit(
  config: AppConfig,
  input: NamedText,
  parts: number | undefined,
  registry: AdapterRegistry,
): SplitBuild {
  const { document, info } = parseFile(config, "input", input, registry);
  if (parts === undefined || !info.ok) return { file: info };

  const adapter = sourceFor(registry, input.path, config.input.adapterId);
  const chunks = splitRecords(document.records, parts);
  return {
    file: info,
    parts: chunks.map((chunk) => ({ content: adapter.reemit(chunk), rowCount: chunk.length })),
  };
}

/**
 * Parse every file against the schema the join targets (output files against
 * the output schema, remaining files against the input schema), then check the
 * set as a whole: headers must match the first file exactly (cells are
 * positional), duplicate rows warn, and differing dialects warn that rows are
 * normalized. The joined content is one reemit of all records in order.
 */
export function buildJoin(
  config: AppConfig,
  kind: JoinKind,
  inputs: NamedText[],
  registry: AdapterRegistry,
): JoinBuild {
  const crossFileIssues: ValidationIssue[] = [];
  const files: PrepareFileInfo[] = [];
  const documents: SourceDocument[] = [];

  for (const file of inputs) {
    const { document, info } = parseFile(config, kind, file, registry);
    files.push(info);
    documents.push(document);
  }

  const first = documents[0];
  if (first) {
    documents.forEach((doc, i) => {
      if (i === 0) return;
      if (!headersMatch(first.headers, doc.headers)) {
        crossFileIssues.push({
          kind: "schema",
          severity: "error",
          message: `"${files[i]!.path}" has different column order or names than "${files[0]!.path}" — files must match exactly to join.`,
        });
      }
      if (
        doc.meta["delimiter"] !== first.meta["delimiter"] ||
        doc.meta["newline"] !== first.meta["newline"]
      ) {
        crossFileIssues.push({
          kind: "schema",
          severity: "warning",
          message: `"${files[i]!.path}" uses a different newline/delimiter format; joined rows are normalized to the first file's format.`,
        });
      }
    });
  }

  const allRecords: RawRecord[] = documents.flatMap((doc) => [...doc.records]);
  const duplicates = first ? findDuplicateRecords(first.headers, allRecords) : [];
  crossFileIssues.push(...duplicates);

  const ok = files.length > 0 && files.every((f) => f.ok) && !hasError(crossFileIssues);

  let content: string | undefined;
  if (ok) {
    const side = kind === "output" ? config.output : config.input;
    const adapter = sourceFor(registry, inputs[0]!.path, side.adapterId);
    content = adapter.reemit(allRecords);
  }

  return {
    files,
    crossFileIssues,
    totalRows: allRecords.length,
    duplicateCount: duplicates.length,
    ok,
    content,
  };
}
