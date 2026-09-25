import { BrowserWindow } from "electron";
import { findModel, MODELS, type EngineState } from "@core";
import { IPC_EVENT } from "@core/ipc";
import { appState } from "../../state";
import { getSettings } from "../settings-store";
import { setModelDownloadEnabled } from "../network-guard";
import { downloadModel } from "./downloader";
import { deleteModel as removeModel, isModelPresent, pruneUnknownModels } from "./model-store";
import { aiState, cachedAnalyses, shutdownAi } from "./analysis-service";

/**
 * The download half of the feature, and the gate in front of all of it.
 *
 * Kept apart from `analysis-service.ts` on purpose: that one is about running a
 * model over records, this one is about whether there is a model at all and
 * whether this deployment is allowed to go and get one.
 */

let inFlight: AbortController | null = null;
/** Progress lives here rather than in the analysis service; it is not analysis. */
let downloading: EngineState | null = null;

const broadcast = (state: EngineState): void => {
  downloading = state.kind === "downloading" ? state : null;
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC_EVENT.aiStatus, state);
};

/** `ai.anomalyDetection` for the loaded config; permissive with none loaded. */
export const configAllowsAi = (): boolean => appState.config?.ai.anomalyDetection !== false;

/** `network.modelDownload` for the loaded config. */
export const configAllowsDownload = (): boolean => appState.config?.network.modelDownload !== false;

/**
 * Re-apply the download gate.
 *
 * Called whenever a config loads. The webRequest hook reads the flag at request
 * time, so this takes effect on traffic already in flight rather than only on
 * the next attempt.
 */
export function applyAiPolicy(): void {
  const allowed = configAllowsAi() && configAllowsDownload();
  setModelDownloadEnabled(allowed);
  if (!allowed) cancelDownload();
  if (!configAllowsAi()) shutdownAi();
}

/**
 * Clear out weights the manifest no longer names. Call once, at startup.
 *
 * The list of models changes between releases, and when it does, whatever was on
 * disk for a dropped or re-pinned entry becomes invisible — no row renders for
 * it, so nothing in the UI can delete it. Left alone it is a couple of gigabytes
 * a labeler cannot account for or reclaim. Not an error path, so it only logs.
 */
export async function pruneOrphanedModels(): Promise<void> {
  try {
    const removed = await pruneUnknownModels(MODELS);
    if (removed.length > 0) {
      console.info(`[ai] removed ${String(removed.length)} orphaned model file(s)`);
    }
  } catch (err) {
    console.warn("[ai] could not prune orphaned models:", err);
  }
}

/** Which models are on this machine. */
export async function downloadedModels(): Promise<string[]> {
  const present = await Promise.all(
    MODELS.map(async (spec) => ((await isModelPresent(spec)) ? spec.id : null)),
  );
  return present.filter((id): id is string => id !== null);
}

export async function aiStatus(): Promise<{
  state: EngineState;
  downloaded: string[];
  cached: ReturnType<typeof cachedAnalyses>;
}> {
  return {
    // A download in progress outranks whatever the engine last said; it is the
    // thing the labeler is waiting on.
    state: downloading ?? aiState(),
    downloaded: await downloadedModels(),
    cached: cachedAnalyses(),
  };
}

export async function startDownload(modelId: string): Promise<void> {
  const spec = findModel(modelId);
  if (!spec) return;
  if (!configAllowsAi() || !configAllowsDownload()) {
    broadcast({ kind: "error", message: "This config does not permit downloading a model." });
    return;
  }
  // The labeler has to have asked as well. The config only ever says whether
  // they may be offered the choice.
  if (!getSettings().aiEnabled) {
    broadcast({ kind: "error", message: "Turn on anomaly detection before downloading." });
    return;
  }

  cancelDownload();
  const controller = new AbortController();
  inFlight = controller;

  broadcast({ kind: "downloading", modelId, receivedBytes: 0, totalBytes: spec.bytes });
  const result = await downloadModel(
    spec,
    ({ receivedBytes, totalBytes }) =>
      broadcast({ kind: "downloading", modelId, receivedBytes, totalBytes }),
    controller.signal,
  );
  if (inFlight === controller) inFlight = null;

  if (result.ok) broadcast({ kind: "ready", modelId });
  else if (result.canceled) broadcast({ kind: "no-model" });
  else broadcast({ kind: "error", message: result.error ?? "Download failed." });
}

export function cancelDownload(): void {
  inFlight?.abort();
  inFlight = null;
  downloading = null;
}

export async function deleteModel(modelId: string): Promise<void> {
  const spec = findModel(modelId);
  if (!spec) return;
  shutdownAi();
  await removeModel(spec);
  broadcast({ kind: "no-model" });
}
