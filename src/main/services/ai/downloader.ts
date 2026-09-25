import { createWriteStream } from "node:fs";
import { statfs } from "node:fs/promises";
import { session } from "electron";
import { modelUrl, type ModelSpec } from "@core";
import { networkLog } from "../network-log";
import { acceptsResume, checkSpace, planResume, shouldReport } from "./download-policy";
import { ensureModelDir, finalize, modelsDir, partialBytes, partialPath } from "./model-store";

/**
 * Fetching model weights, through the app's own network policy.
 *
 * **Why this exists rather than `node-llama-cpp`'s own downloader.** That one
 * uses Node's `https`, which does not pass through Chromium's `webRequest` —
 * so the allowlist in `network-policy.ts`, the deny logging, and the config
 * flag that is supposed to gate all of this would every one of them be
 * bypassed, silently, while appearing to work. `net.fetch` bound to a session
 * *does* trigger that session's handlers, which is the whole reason this file
 * is written by hand.
 *
 * The library is only ever handed a local path.
 */

/** Its own partition, so this traffic is judged under the `model` scope alone. */
export const MODEL_PARTITION = "model-download";

const modelSession = (): Electron.Session =>
  session.fromPartition(MODEL_PARTITION, { cache: false });

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
}

export interface DownloadResult {
  ok: boolean;
  /** Set when `ok` is false. Absent when the caller cancelled. */
  error?: string;
  canceled?: boolean;
}

async function freeBytes(): Promise<number> {
  try {
    const info = await statfs(modelsDir());
    return info.bavail * info.bsize;
  } catch {
    // An unreadable filesystem is not a reason to refuse; the write will fail
    // with something more specific if there genuinely is no room.
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Download one model, resuming if a partial is already there.
 *
 * Progress is reported sparsely — see `shouldReport`. Cancellation is via the
 * caller's `AbortSignal`, and leaves the partial in place so the next attempt
 * can pick it up.
 */
export async function downloadModel(
  spec: ModelSpec,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<DownloadResult> {
  const url = modelUrl(spec);
  const host = new URL(url).host;

  await ensureModelDir(spec);
  const have = await partialBytes(spec);
  const plan = planResume(have, spec.bytes);

  const space = checkSpace(spec.bytes - plan.from, await freeBytes());
  if (!space.ok) {
    networkLog.record({
      kind: "model-download",
      label: "Download model",
      host,
      outcome: "error",
      detail: space.error,
    });
    return { ok: false, error: space.error };
  }

  networkLog.record({
    kind: "model-download",
    label: "Download model",
    host,
    outcome: "started",
    detail: plan.from > 0 ? `Resuming at ${String(plan.from)} bytes` : spec.name,
  });

  let received = plan.from;
  let reported = plan.from;

  try {
    // `session.fetch`, not `net.fetch`: the former issues the request on this
    // session and so triggers its `webRequest` handlers, which is what puts the
    // allowlist in front of it. `net.fetch` would use the default session.
    const response = await modelSession().fetch(url, {
      signal,
      headers: plan.rangeHeader === undefined ? {} : { Range: plan.rangeHeader },
    });

    if (!acceptsResume(response.status, plan.rangeHeader !== undefined)) {
      const error = `Download refused: HTTP ${String(response.status)}.`;
      networkLog.record({
        kind: "model-download",
        label: "Download model",
        host,
        outcome: "error",
        detail: error,
      });
      return { ok: false, error };
    }
    if (!response.body) {
      return { ok: false, error: "Download returned no data." };
    }

    // `flags: "a"` because a resumed request appends. `acceptsResume` above is
    // what guarantees the server actually sent a continuation rather than the
    // whole file again.
    const sink = createWriteStream(partialPath(spec), { flags: plan.from > 0 ? "a" : "w" });
    await response.body.pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          received += chunk.byteLength;
          if (shouldReport(reported, received, spec.bytes)) {
            reported = received;
            onProgress({ receivedBytes: received, totalBytes: spec.bytes });
          }
          return new Promise<void>((resolve, reject) => {
            sink.write(chunk, (err) => (err ? reject(err) : resolve()));
          });
        },
        close() {
          return new Promise<void>((resolve) => sink.end(resolve));
        },
        abort() {
          return new Promise<void>((resolve) => sink.close(() => resolve()));
        },
      }),
      { signal },
    );
  } catch (err) {
    if (signal.aborted) {
      networkLog.record({
        kind: "model-download",
        label: "Download model",
        host,
        outcome: "denied",
        detail: "Cancelled",
      });
      return { ok: false, canceled: true };
    }
    const error = err instanceof Error ? err.message : "Download failed.";
    networkLog.record({
      kind: "model-download",
      label: "Download model",
      host,
      outcome: "error",
      detail: error,
    });
    return { ok: false, error };
  }

  const verified = await finalize(spec);
  networkLog.record({
    kind: "model-download",
    label: "Download model",
    host,
    outcome: verified.ok ? "success" : "error",
    detail: verified.ok ? `${spec.name} verified` : verified.error,
  });
  return verified.ok ? { ok: true } : { ok: false, error: verified.error };
}

/** Unused locally, but exported so the guard can register the same partition. */
export const modelDownloadSession = modelSession;
