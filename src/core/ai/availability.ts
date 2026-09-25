/**
 * Whether the anomaly-detection feature exists for this deployment.
 *
 * Two config flags answer two different questions, asked by different people:
 *
 * - `ai.anomalyDetection` — *should labelers on this task see model suggestions
 *   at all?* A task-design question, largely about anchoring.
 * - `network.modelDownload` — *may this machine fetch a gigabyte from the
 *   internet?* A deployment and security question. It lives under `network`
 *   because every key there names a kind of traffic.
 *
 * One expression of the rule, one call site per surface — the same discipline as
 * `network-prefs.ts`, and for the same reason: a rule re-derived in three places
 * is a rule that will eventually disagree with itself.
 */

export interface AvailabilityInput {
  /** `ai.anomalyDetection` from the loaded config. */
  configAllowsAi: boolean;
  /** `network.modelDownload` from the loaded config. */
  configAllowsDownload: boolean;
  /** A usable model is already on disk. */
  modelPresent: boolean;
  /** This build can run the engine at all — see `isPlatformSupported`. */
  platformSupported: boolean;
}

export type Unavailable =
  | "config-forbids-ai"
  | "no-model-and-downloads-forbidden"
  | "platform-unsupported";

/**
 * Why the feature is absent, or `null` when it is available.
 *
 * The carve-out in the middle is the one worth reading twice: the model lives in
 * `userData`, which is **per machine**, while a config is **per project**. A
 * project that forbids downloads must not hide a model that is already sitting
 * on disk and needs no network whatsoever to run. It only hides the feature when
 * there is nothing to run *and* no way to get it.
 */
export function anomalyUnavailableReason(input: AvailabilityInput): Unavailable | null {
  if (!input.platformSupported) return "platform-unsupported";
  if (!input.configAllowsAi) return "config-forbids-ai";
  if (!input.modelPresent && !input.configAllowsDownload) {
    return "no-model-and-downloads-forbidden";
  }
  return null;
}

/** Whether the feature is offered at all. */
export const isAnomalyAvailable = (input: AvailabilityInput): boolean =>
  anomalyUnavailableReason(input) === null;

/**
 * Whether a download may be started right now.
 *
 * Deliberately separate from availability: with a model already present the
 * feature is available while downloading a *different* one is still forbidden.
 */
export const canDownloadModel = (input: AvailabilityInput): boolean =>
  input.platformSupported && input.configAllowsAi && input.configAllowsDownload;

/**
 * Whether this build can run the inference engine.
 *
 * `node-llama-cpp` ships per-platform prebuilt binaries and cannot cross-compile,
 * and the release workflow packages macOS on an arm64 runner — so a mac x64
 * artifact would carry no usable binary. Rather than ship something that fails at
 * load time, that build reports the feature as absent and everything else about
 * it keeps working.
 */
export const isPlatformSupported = (platform: string, arch: string): boolean =>
  platform === "darwin" ? arch === "arm64" : platform === "win32" || platform === "linux";
