import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, findModel, MODELS, modelUrl } from "./models";

describe("the model table", () => {
  it("offers only decision models", () => {
    expect(MODELS.map((m) => m.id)).toEqual(["jevk5-4b", "jevk5-2b", "jevk5-9b"]);
  });

  it("defaults to the 4B, the best accuracy per byte", () => {
    expect(DEFAULT_MODEL_ID).toBe("jevk5-4b");
  });

  it("pins a fitted temperature for every model", () => {
    // A file read at another file's temperature is miscalibrated, not merely
    // slower: it produces confident numbers that are wrong. So this is as
    // load-bearing as the hash beside it, and belongs in the same table.
    for (const spec of MODELS) {
      expect(spec.decision.temperature).toBeGreaterThan(0);
      expect(spec.decision.knockoutTemperature).toBeGreaterThan(0);
    }
  });

  it("gives every model its own temperature — they are not interchangeable", () => {
    const temperatures = new Set(MODELS.map((m) => m.decision.temperature));
    expect(temperatures.size).toBe(MODELS.length);
  });

  it("pins a distinct sha256 and an exact byte length for every file", () => {
    const hashes = new Set(MODELS.map((m) => m.sha256));
    expect(hashes.size).toBe(MODELS.length);
    for (const spec of MODELS) {
      expect(spec.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(spec.bytes)).toBe(true);
      expect(spec.bytes).toBeGreaterThan(0);
    }
  });

  it("builds an anonymous Hugging Face resolve URL", () => {
    expect(modelUrl(MODELS[0]!)).toBe(
      "https://huggingface.co/alibiserikbay/JevK5-GGUF/resolve/main/jevk5-4b-v0.3-Q4_K_M.gguf",
    );
  });

  it("finds a model by id, and nothing by a retired one", () => {
    expect(findModel("jevk5-2b")?.name).toBe("JevK5 2B");
    expect(findModel("qwen3.5-2b")).toBeUndefined();
  });

  it("ships only Apache-2.0 weights", () => {
    for (const spec of MODELS) expect(spec.license).toBe("Apache-2.0");
  });
});
