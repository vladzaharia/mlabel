import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { dialog } from "electron";
import type {
  AppConfig,
  ExportRequest,
  ExportResponse,
  InputLoadResponse,
  SessionData,
} from "@core";
import { fingerprintsEqual } from "@core";
import { createDefaultRegistry } from "@core/adapters";
import { appState, type LoadedInput } from "../state";
import { loadSessionFor, saveSession, setRecent } from "./session-store";
import { buildExport, buildRecordViews } from "./pipeline";
import { fingerprintOf } from "./fingerprint";

const registry = createDefaultRegistry();

export async function loadInputFromPath(path: string): Promise<InputLoadResponse> {
  const config = appState.config;
  const configPath = appState.configPath;
  if (!config || !configPath)
    return { ok: false, error: "Load a config before opening input data." };

  let buf: Buffer;
  let fileStat: { size: number; mtimeMs: number };
  try {
    [buf, fileStat] = await Promise.all([
      readFile(path),
      stat(path).then((s) => ({ size: s.size, mtimeMs: s.mtimeMs })),
    ]);
  } catch {
    return { ok: false, error: `Could not read input file: ${path}` };
  }

  const text = buf.toString("utf8");
  const fingerprint = fingerprintOf(buf, fileStat);

  const adapter =
    registry.sourceForExtension(extname(path)) ?? registry.source(config.input.adapterId);
  const expected = config.input.fields.map((f) => f.name);
  const { document, issues } = adapter.parse(
    { kind: "content", name: basename(path), text },
    expected,
    config.input.adapterConfig,
  );

  const { records, inputValues } = buildRecordViews(config, document);
  const input: LoadedInput = { inputPath: path, document, inputValues, fingerprint };
  appState.setInput(input);
  await setRecent({ config: configPath, input: path });

  const blockingErrors = issues.filter((i) => i.severity === "error");
  const resume = await loadSessionFor(configPath, path);

  // Detect staleness: only when the saved session has a fingerprint stamped on it.
  // Legacy sessions without `source` are treated as unverified (not stale).
  const resumeStale =
    resume?.source !== undefined ? !fingerprintsEqual(resume.source, fingerprint) : undefined;

  return {
    ok: blockingErrors.length === 0,
    path,
    records,
    headerIssues: issues,
    resume,
    resumeStale,
    error:
      blockingErrors.length > 0 ? "The input file does not match the input schema." : undefined,
  };
}

/**
 * Save a labeling session stamped with the current input file's fingerprint.
 * This is the authoritative save path — the fingerprint is injected here in
 * main so the renderer stays ignorant of file system details.
 *
 * Fire-and-forget (same contract as saveSession in session-store).
 */
export function saveSessionStamped(data: SessionData): void {
  const input = appState.input;
  const source = input && input.inputPath === data.inputPath ? input.fingerprint : undefined;
  saveSession({ ...data, source });
}

export async function pickInput(): Promise<InputLoadResponse> {
  const result = await dialog.showOpenDialog({
    title: "Select an input file to label",
    properties: ["openFile"],
    filters: [{ name: "Data", extensions: ["csv", "tsv"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
  return loadInputFromPath(result.filePaths[0]!);
}

function outputExtension(config: AppConfig): string {
  try {
    return registry.sink(config.output.adapterId).manifest.extensions[0] ?? ".csv";
  } catch {
    return ".csv";
  }
}

export async function exportLabels(request: ExportRequest): Promise<ExportResponse> {
  const config = appState.config;
  const input = appState.input;
  if (!config || !input)
    return { ok: false, error: "Nothing to export — load a config and input first." };

  const artifacts = buildExport(
    config,
    input.document,
    input.inputValues,
    request.labels,
    registry,
  );

  const dir = dirname(input.inputPath);
  const ext = extname(input.inputPath);
  const stem = basename(input.inputPath, ext);
  const outputPath = join(dir, `${stem}-output${outputExtension(config)}`);

  try {
    await writeFile(outputPath, artifacts.outputContent, "utf8");
    let remainingPath: string | undefined;
    if (artifacts.remainingContent !== undefined) {
      remainingPath = join(dir, `${stem}-remaining${ext}`);
      await writeFile(remainingPath, artifacts.remainingContent, "utf8");
    }
    return {
      ok: true,
      outputPath,
      remainingPath,
      completeCount: artifacts.completeCount,
      remainingCount: artifacts.remainingCount,
    };
  } catch (err) {
    return { ok: false, error: `Failed to write output: ${(err as Error).message}` };
  }
}
