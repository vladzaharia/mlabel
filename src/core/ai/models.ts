/**
 * The models this app will download, and nothing else.
 *
 * Every field here is pinned in source rather than discovered at runtime. That
 * is the point: a download whose URL, size and hash are all decided by the
 * remote end is not a download you can reason about. The app fetches exactly one
 * of these files, checks it against the SHA256 below, and refuses anything else.
 *
 * Verified live against the Hugging Face API: the repo is public, ungated and
 * Apache-2.0, the files fetch with a plain anonymous GET, and every hash here
 * agrees byte-for-byte between the repo's own `SHA256SUMS` and the tree API's
 * `lfs.oid` — two independent sources for the number that decides whether a
 * download is trusted.
 */

/**
 * How to read this model's probabilities.
 *
 * The temperature is fitted per quantisation against held-out examples and
 * published alongside the weights, which makes it **part of the file's
 * identity**: reading one file at another's temperature yields confident numbers
 * that are wrong, and that is worse than being slow, because nothing downstream
 * can tell. So it is pinned next to the hash, for the reason the hash is pinned.
 */
export interface DecisionCalibration {
  /** Divides the label logits before the softmax. */
  temperature: number;
  /**
   * For questions with more options than `MAX_LABELS`.
   *
   * The config caps `choice` below that, so this is recorded rather than used —
   * someone comparing this table against the model card should find every
   * published number here, including the one we arrange never to need.
   */
  knockoutTemperature: number;
}

export interface ModelSpec {
  /** Stable key used on disk, in settings, and in IPC. */
  id: string;
  /** What a person sees. */
  name: string;
  /** Hugging Face repo the file lives in. */
  repo: string;
  /** File within that repo. */
  file: string;
  /** Exact byte length, from the HF tree API. */
  bytes: number;
  /** SHA256, from the tree API's `lfs.oid`. */
  sha256: string;
  license: string;
  /** Roughly how big the thing is, for the download prompt. */
  parameters: string;
  /** One line explaining when to pick this one. */
  note: string;
  decision: DecisionCalibration;
}

/**
 * JevK5 — a Qwen3.5 fine-tune that answers typed questions.
 *
 * A decision model, not a chat model: it is given a question whose answers are
 * declared up front and it scores them, read off the next-token logits of
 * single-letter labels. That needs no custom head and no patched runtime, which
 * is the whole reason these three and not Kev or Laya — both of which want a
 * decision head `llama.cpp` has not released (PR #29818 is still open), and
 * Laya's GGUF conversions carry only the encoder, leaving the head in PyTorch.
 *
 * Offered best-accuracy-per-byte first, which is also smallest-download-first
 * among the two that fit a normal machine.
 */
export const MODELS: readonly ModelSpec[] = [
  {
    id: "jevk5-4b",
    name: "JevK5 4B",
    repo: "alibiserikbay/JevK5-GGUF",
    file: "jevk5-4b-v0.3-Q4_K_M.gguf",
    bytes: 2_708_804_000,
    sha256: "94ca0d7745c47f79091b0892ca657c81d9dc9e4ed0238ba0a7ea261d8938c882",
    license: "Apache-2.0",
    parameters: "4B",
    note: "Recommended. Best accuracy per byte.",
    decision: { temperature: 1.22, knockoutTemperature: 0.93 },
  },
  {
    id: "jevk5-2b",
    name: "JevK5 2B",
    repo: "alibiserikbay/JevK5-GGUF",
    file: "jevk5-2b-v0.2-Q8_0.gguf",
    bytes: 2_012_012_000,
    sha256: "17222f27a89273aca7614e34083a530b0d90cd51cffeb225c7acc8e79a7e0eba",
    license: "Apache-2.0",
    parameters: "2B",
    note: "Smallest and fastest. Weaker on hard records.",
    decision: { temperature: 1.42, knockoutTemperature: 0.77 },
  },
  {
    id: "jevk5-9b",
    name: "JevK5 9B",
    repo: "alibiserikbay/JevK5-GGUF",
    file: "jevk5-9b-v0.3.3-Q5_K_M.gguf",
    bytes: 6_467_969_504,
    sha256: "da4a4becd04c3beabd4cefbd09b546ce2648740d923adc8d14ae1d0cb921486e",
    license: "Apache-2.0",
    parameters: "9B",
    note: "Most accurate. A 6.5 GB download, and wants a strong machine.",
    decision: { temperature: 1.316, knockoutTemperature: 1.05 },
  },
];

/*
 * The text models this feature used to run, kept readable rather than deleted.
 *
 * They are not simply slower or weaker here — they cannot answer a typed
 * question at all. A text model is asked for prose and must be constrained,
 * parsed and re-checked, and it can still return a sentence where an answer
 * belongs; whatever confidence it expresses in that sentence is calibrated
 * against nothing. Everything the old path spent on surviving that — a token
 * cap, three flavours of unparseable output, a deliberate refusal to repair
 * truncated JSON — existed only because the answer space was open.
 *
 * {
 *   id: "qwen3.5-2b", name: "Qwen3.5 2B", repo: "unsloth/Qwen3.5-2B-GGUF",
 *   file: "Qwen3.5-2B-Q4_K_M.gguf", bytes: 1_280_835_840,
 *   sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
 *   license: "Apache-2.0", parameters: "2.3B",
 * },
 * {
 *   id: "qwen3-1.7b", name: "Qwen3 1.7B", repo: "unsloth/Qwen3-1.7B-GGUF",
 *   file: "Qwen3-1.7B-Q4_K_M.gguf", bytes: 1_107_409_472,
 *   sha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
 *   license: "Apache-2.0", parameters: "1.7B",
 * },
 */

export const DEFAULT_MODEL_ID = MODELS[0]!.id;

export const findModel = (id: string): ModelSpec | undefined => MODELS.find((m) => m.id === id);

/**
 * Where the file is fetched from.
 *
 * The plain `resolve` endpoint, which answers with a single 302 to a regional
 * CDN. No token, no custom headers: this repo is public, and needing credentials
 * would mean the app had to hold some.
 */
export const modelUrl = (spec: ModelSpec): string =>
  `https://huggingface.co/${spec.repo}/resolve/main/${spec.file}`;
