import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dialog } from "electron";
import type {
  JoinAnalyzeResponse,
  JoinKind,
  JoinRequest,
  JoinRunResponse,
  SplitAnalyzeResponse,
  SplitRequest,
  SplitRunResponse,
} from "@core";
import { createDefaultRegistry } from "@core/adapters";
import { appState } from "../state";
import { buildJoin, buildSplit, type NamedText } from "./prepare-pipeline";
import { defaultJoinFileName, splitTargetPaths } from "./prepare-naming";

/**
 * Thin fs/dialog layer for Prepare mode (the logic lives in prepare-pipeline).
 * Deliberately stateless — runs re-read files from disk so nothing can go
 * stale — and it never touches `appState.input`, recents, or session files:
 * Prepare must not disturb a labeling session.
 */

const registry = createDefaultRegistry();

const DATA_FILTERS = [{ name: "Data", extensions: ["csv", "tsv"] }];

async function readNamed(path: string): Promise<NamedText> {
  return { path, text: await readFile(path, "utf8") };
}

async function readAll(paths: readonly string[]): Promise<NamedText[]> {
  const results = await Promise.allSettled(paths.map(readNamed));
  const failed = results.findIndex((r) => r.status === "rejected");
  if (failed >= 0) throw new Error(`Could not read file: ${paths[failed]!}`);
  return results.map((r) => (r as PromiseFulfilledResult<NamedText>).value);
}

export async function analyzeSplitFile(path: string): Promise<SplitAnalyzeResponse> {
  const config = appState.config;
  if (!config) return { ok: false, error: "Load a config before preparing data." };
  let file: NamedText;
  try {
    file = await readNamed(path);
  } catch {
    return { ok: false, error: `Could not read file: ${path}` };
  }
  const build = buildSplit(config, file, undefined, registry);
  return { ok: build.file.ok, file: build.file };
}

export async function pickSplitFile(): Promise<SplitAnalyzeResponse> {
  const result = await dialog.showOpenDialog({
    title: "Select an input file to split",
    properties: ["openFile"],
    filters: DATA_FILTERS,
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  return analyzeSplitFile(result.filePaths[0]!);
}

export async function runSplit(request: SplitRequest): Promise<SplitRunResponse> {
  const config = appState.config;
  if (!config) return { ok: false, error: "Load a config before preparing data." };

  let file: NamedText;
  try {
    file = await readNamed(request.path);
  } catch {
    return { ok: false, error: `Could not read file: ${request.path}` };
  }

  let parts: { content: string; rowCount: number }[];
  try {
    const build = buildSplit(config, file, request.parts, registry);
    if (!build.parts) {
      return { ok: false, error: "The file no longer matches the input schema." };
    }
    parts = build.parts;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const targets = splitTargetPaths(request.path, request.parts);
  const existing = targets.filter((t) => existsSync(t));
  if (existing.length > 0) {
    return { ok: false, error: `Refusing to overwrite existing files: ${existing.join(", ")}` };
  }

  try {
    await Promise.all(targets.map((target, i) => writeFile(target, parts[i]!.content, "utf8")));
  } catch (err) {
    return { ok: false, error: `Failed to write split files: ${(err as Error).message}` };
  }

  return {
    ok: true,
    files: targets.map((path, i) => ({ path, rowCount: parts[i]!.rowCount })),
  };
}

export async function analyzeJoinFiles(request: JoinRequest): Promise<JoinAnalyzeResponse> {
  const config = appState.config;
  if (!config) return { ok: false, error: "Load a config before preparing data." };

  let files: NamedText[];
  try {
    files = await readAll(request.paths);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const build = buildJoin(config, request.kind, files, registry);
  return {
    ok: build.ok,
    files: build.files,
    crossFileIssues: build.crossFileIssues,
    totalRows: build.totalRows,
  };
}

export async function pickJoinFiles(kind: JoinKind): Promise<JoinAnalyzeResponse> {
  const result = await dialog.showOpenDialog({
    title: kind === "output" ? "Select output files to join" : "Select remaining files to join",
    properties: ["openFile", "multiSelections"],
    filters: DATA_FILTERS,
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  return analyzeJoinFiles({ kind, paths: result.filePaths });
}

export async function runJoin(request: JoinRequest): Promise<JoinRunResponse> {
  const config = appState.config;
  if (!config) return { ok: false, error: "Load a config before preparing data." };
  if (request.paths.length === 0) return { ok: false, error: "No files to join." };

  let files: NamedText[];
  try {
    files = await readAll(request.paths);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const build = buildJoin(config, request.kind, files, registry);
  if (!build.ok || build.content === undefined) {
    const firstError =
      build.files.flatMap((f) => f.issues).find((i) => i.severity === "error") ??
      build.crossFileIssues.find((i) => i.severity === "error");
    return { ok: false, error: firstError?.message ?? "The files cannot be joined." };
  }

  const first = request.paths[0]!;
  const target = await dialog.showSaveDialog({
    title: "Save joined file",
    defaultPath: join(dirname(first), defaultJoinFileName(request.kind, first)),
    filters: DATA_FILTERS,
  });
  if (target.canceled || !target.filePath) return { ok: false, canceled: true };

  try {
    await writeFile(target.filePath, build.content, "utf8");
  } catch (err) {
    return { ok: false, error: `Failed to write joined file: ${(err as Error).message}` };
  }

  return {
    ok: true,
    path: target.filePath,
    rowCount: build.totalRows,
    duplicateCount: build.duplicateCount,
  };
}
