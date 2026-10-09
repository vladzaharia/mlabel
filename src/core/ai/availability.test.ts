import { describe, expect, it } from "vitest";
import {
  anomalyUnavailableReason,
  canDownloadModel,
  isAnomalyAvailable,
  isPlatformSupported,
  type AvailabilityInput,
} from "./availability";

const input = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({
  configAllowsAi: true,
  configAllowsDownload: true,
  modelPresent: false,
  platformSupported: true,
  ...over,
});

describe("anomalyUnavailableReason", () => {
  it("is available when everything permits it", () => {
    expect(anomalyUnavailableReason(input())).toBeNull();
    expect(isAnomalyAvailable(input())).toBe(true);
  });

  it("is absent when the config forbids AI, whatever else is true", () => {
    const reason = anomalyUnavailableReason(
      input({ configAllowsAi: false, modelPresent: true, configAllowsDownload: true }),
    );
    expect(reason).toBe("config-forbids-ai");
  });

  it("is absent with no model and no way to get one", () => {
    expect(anomalyUnavailableReason(input({ configAllowsDownload: false }))).toBe(
      "no-model-and-downloads-forbidden",
    );
  });

  // The carve-out. A model lives in userData — per machine — while a config is
  // per project, so a project that forbids downloads must not disable a model
  // that is already there and needs no network to run.
  it("stays available offline when the model is already on disk", () => {
    expect(
      anomalyUnavailableReason(input({ configAllowsDownload: false, modelPresent: true })),
    ).toBeNull();
  });

  it("is absent on a build that cannot run the engine", () => {
    expect(anomalyUnavailableReason(input({ platformSupported: false }))).toBe(
      "platform-unsupported",
    );
  });

  // Someone reading the reason should be told the most fundamental problem, not
  // an incidental one they might try to fix first.
  it("reports the platform before anything a config could change", () => {
    expect(
      anomalyUnavailableReason(input({ platformSupported: false, configAllowsAi: false })),
    ).toBe("platform-unsupported");
  });
});

describe("canDownloadModel", () => {
  it("needs both flags", () => {
    expect(canDownloadModel(input())).toBe(true);
    expect(canDownloadModel(input({ configAllowsDownload: false }))).toBe(false);
    expect(canDownloadModel(input({ configAllowsAi: false }))).toBe(false);
  });

  // Distinct from availability: a present model makes the feature usable while
  // fetching a different one stays forbidden.
  it("stays false with a model present but downloads forbidden", () => {
    const state = input({ configAllowsDownload: false, modelPresent: true });
    expect(isAnomalyAvailable(state)).toBe(true);
    expect(canDownloadModel(state)).toBe(false);
  });
});

describe("isPlatformSupported", () => {
  it("allows Apple Silicon but not Intel macOS", () => {
    expect(isPlatformSupported("darwin", "arm64")).toBe(true);
    // The release workflow packages macOS on an arm64 runner and the native
    // binaries cannot cross-compile, so an x64 build would carry none.
    expect(isPlatformSupported("darwin", "x64")).toBe(false);
  });

  it("allows both Windows architectures", () => {
    expect(isPlatformSupported("win32", "x64")).toBe(true);
    expect(isPlatformSupported("win32", "arm64")).toBe(true);
  });

  it("allows Linux", () => {
    expect(isPlatformSupported("linux", "x64")).toBe(true);
  });

  it("refuses anything it has never heard of", () => {
    expect(isPlatformSupported("freebsd", "x64")).toBe(false);
  });
});
