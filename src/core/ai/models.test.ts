import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_ID, findModel, MODELS, modelUrl } from "./models";

/**
 * The manifest is the one file where a typo is expensive and slow to notice.
 *
 * A wrong `bytes` or `sha256` costs a labeler a multi-gigabyte download that
 * then fails its integrity check and is deleted — reported as corruption, which
 * points at the network rather than at this file. A wrong `repo` or `file` is a
 * 404 after the download has already started. None of it is caught by types.
 *
 * So these are shape checks, run offline. They cannot tell you a hash is the
 * *right* hash — only downloading can do that — but they catch every way of
 * writing one that could not possibly be right.
 */

describe("the model manifest", () => {
  it("offers at least one model", () => {
    expect(MODELS.length).toBeGreaterThan(0);
  });

  it("has a unique id per model", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Models share a directory root keyed by id, and settings persist the id, so
  // a value needing escaping would land weights somewhere unintended.
  it("uses ids that are safe as a path segment", () => {
    for (const m of MODELS) {
      expect(m.id, m.id).toMatch(/^[a-z0-9][a-z0-9.-]*$/);
    }
  });

  it("defaults to a model that exists", () => {
    expect(findModel(DEFAULT_MODEL_ID)).toBeDefined();
  });

  it("defaults to the smallest download", () => {
    // Turning the feature on should not open with the largest file on the list.
    const smallest = Math.min(...MODELS.map((m) => m.bytes));
    expect(findModel(DEFAULT_MODEL_ID)?.bytes).toBe(smallest);
  });

  it("is ordered by size", () => {
    const sizes = MODELS.map((m) => m.bytes);
    expect(sizes).toEqual([...sizes].toSorted((a, b) => a - b));
  });

  it("pins a plausible SHA256 for every model", () => {
    for (const m of MODELS) {
      expect(m.sha256, m.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("pins a plausible byte length for every model", () => {
    for (const m of MODELS) {
      expect(Number.isSafeInteger(m.bytes), m.id).toBe(true);
      // Nothing useful is under 100 MB; a smaller number means a placeholder.
      expect(m.bytes, m.id).toBeGreaterThan(100_000_000);
    }
  });

  it("names a GGUF file for every model", () => {
    for (const m of MODELS) {
      expect(m.file, m.id).toMatch(/\.gguf$/);
      expect(m.repo, m.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("says something about every model", () => {
    for (const m of MODELS) {
      expect(m.name.length, m.id).toBeGreaterThan(0);
      expect(m.note.length, m.id).toBeGreaterThan(0);
      expect(m.parameters.length, m.id).toBeGreaterThan(0);
      expect(m.license.length, m.id).toBeGreaterThan(0);
    }
  });

  it("returns nothing for an unknown id", () => {
    expect(findModel("no-such-model")).toBeUndefined();
  });
});

describe("modelUrl", () => {
  /**
   * The structural half of the network guarantee.
   *
   * `network-policy.ts` only permits Hugging Face hosts on the model scope, so
   * an entry pointing anywhere else would be refused at request time and
   * reported as a failed download. Catching it here says *why*.
   */
  it("builds an https Hugging Face URL for every model", () => {
    for (const m of MODELS) {
      const url = new URL(modelUrl(m));
      expect(url.protocol, m.id).toBe("https:");
      expect(url.host, m.id).toBe("huggingface.co");
      // No embedded credentials: these repos are public and the app holds none.
      expect(url.username, m.id).toBe("");
      expect(url.password, m.id).toBe("");
    }
  });

  it("points at the pinned repo and file", () => {
    const spec = MODELS[0]!;
    expect(modelUrl(spec)).toBe(`https://huggingface.co/${spec.repo}/resolve/main/${spec.file}`);
  });
});
