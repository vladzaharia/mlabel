import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { utilityProcess, type UtilityProcess } from "electron";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/**
 * The inference worker's lifecycle, seen from the main process.
 *
 * Holds a forked `utilityProcess`, correlates replies with requests, and lets it
 * go once nobody is using it. Knows nothing about records, queues or findings —
 * `analysis-service.ts` owns all of that. This is the part that has to be
 * careful with a child process, and nothing else.
 */

/**
 * How long a loaded model may sit idle before it is unloaded.
 *
 * A loaded 2B model is roughly 3 GB resident, in an app whose day job is parsing
 * CSVs. Reloading costs a few seconds on the next record, which is real but is
 * paid once and while the labeler is already reading; holding the memory is paid
 * continuously by everything else running on the machine. Five minutes is long
 * enough to cover reading a long record and short enough that a labeler who has
 * gone to lunch is not still paying for it.
 */
const IDLE_UNLOAD_MS = 5 * 60 * 1000;

/** Anything slower than this is a wedged decode, not a slow one. */
const ANALYZE_TIMEOUT_MS = 90_000;

export interface EngineEvents {
  onLoaded: () => void;
  onLoadFailed: (error: string) => void;
  /** The worker went away on its own — a crash, or the OS reclaiming memory. */
  onExit: () => void;
}

interface Pending {
  resolve: (json: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class InferenceEngine {
  #child: UtilityProcess | null = null;
  #pending = new Map<number, Pending>();
  #nextId = 1;
  #idleTimer: NodeJS.Timeout | null = null;
  #loadedPath: string | null = null;

  constructor(private readonly events: EngineEvents) {}

  get isLoaded(): boolean {
    return this.#child !== null && this.#loadedPath !== null;
  }

  get loadedPath(): string | null {
    return this.#loadedPath;
  }

  /**
   * Start a worker and load a model into it.
   *
   * Idempotent for a model already loaded, so callers can ask freely rather than
   * tracking state the engine already has.
   */
  load(modelPath: string, schema: Record<string, unknown>): void {
    if (this.#loadedPath === modelPath && this.#child) {
      this.#touch();
      return;
    }
    this.stop();

    // `fileURLToPath` rather than `__dirname`: main is ESM here.
    const here = fileURLToPath(new URL(".", import.meta.url));
    const child = utilityProcess.fork(join(here, "ai-worker.mjs"), [], {
      serviceName: "mlabel-inference",
      stdio: "ignore",
    });
    this.#child = child;

    child.on("message", (message: WorkerResponse) => this.#receive(message, modelPath));
    child.on("exit", () => {
      const wasRunning = this.#child === child;
      this.#child = null;
      this.#loadedPath = null;
      this.#failAll("The inference process stopped.");
      if (wasRunning) this.events.onExit();
    });

    this.#post({ type: "load", modelPath, schema });
    this.#touch();
  }

  /** Analyse one record. Rejects on timeout, worker death, or a model error. */
  async analyze(prefix: string, suffix: string): Promise<string> {
    if (!this.#child) throw new Error("The inference process is not running.");
    const id = this.#nextId++;
    this.#touch();

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        // A decode this slow is wedged rather than slow, and the worker is the
        // only thing that can be sure — so take it down rather than wait.
        this.stop();
        reject(new Error("The model took too long and was stopped."));
      }, ANALYZE_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      this.#post({ type: "analyze", id, prefix, suffix });
    });
  }

  /** Abandon the in-flight decode. The worker stays loaded. */
  cancel(): void {
    this.#post({ type: "cancel" });
  }

  /** Stop the worker and release the weights. */
  stop(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
    this.#failAll("The inference process was stopped.");
    this.#child?.kill();
    this.#child = null;
    this.#loadedPath = null;
  }

  #post(request: WorkerRequest): void {
    this.#child?.postMessage(request);
  }

  #receive(message: WorkerResponse, modelPath: string): void {
    switch (message.type) {
      case "loaded":
        this.#loadedPath = modelPath;
        this.events.onLoaded();
        return;
      case "load-failed":
        this.#loadedPath = null;
        this.events.onLoadFailed(message.error);
        return;
      case "result": {
        const pending = this.#take(message.id);
        pending?.resolve(message.json);
        this.#touch();
        return;
      }
      case "failed": {
        const pending = this.#take(message.id);
        pending?.reject(new Error(message.error));
        this.#touch();
        return;
      }
    }
  }

  #take(id: number): Pending | undefined {
    const pending = this.#pending.get(id);
    if (pending) {
      clearTimeout(pending.timer);
      this.#pending.delete(id);
    }
    return pending;
  }

  #failAll(reason: string): void {
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.#pending.clear();
  }

  /** Restart the idle countdown. */
  #touch(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => {
      if (this.#pending.size === 0) this.stop();
    }, IDLE_UNLOAD_MS);
  }
}
