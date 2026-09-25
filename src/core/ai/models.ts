/**
 * The models this app will download, and nothing else.
 *
 * Every field here is pinned in source rather than discovered at runtime. That
 * is the point: a download whose URL, size and hash are all decided by the
 * remote end is not a download you can reason about. The app fetches exactly one
 * of these files, checks it against the SHA256 below, and refuses anything else.
 *
 * Verified live against the Hugging Face API: both repos are public, ungated and
 * Apache-2.0, and the files fetch with a plain anonymous GET.
 *
 * Qwen publishes no GGUF for the 3.5 line, so the weights come from well-known
 * community requantisers. Pinning the hash is what makes that acceptable — a
 * changed upload fails the check rather than silently running.
 */

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
}

/**
 * Offered newest-first, which is also largest-first here.
 *
 * `qwen3.5-2b` is the default: it is the newest Qwen line that ships anything
 * under 27B at all. It is a vision-language model on a Gated-DeltaNet + sparse
 * MoE architecture, and llama.cpp had open issues against that architecture
 * through late 2026 — which is exactly why `qwen3-1.7b` stays selectable as a
 * known-good fallback on an older, thoroughly-supported architecture.
 */
export const MODELS: readonly ModelSpec[] = [
  {
    id: "qwen3.5-2b",
    name: "Qwen3.5 2B",
    repo: "unsloth/Qwen3.5-2B-GGUF",
    file: "Qwen3.5-2B-Q4_K_M.gguf",
    bytes: 1_280_835_840,
    sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
    license: "Apache-2.0",
    parameters: "2.3B",
    note: "Newest. Best judgement, slightly slower.",
  },
  {
    id: "qwen3-1.7b",
    name: "Qwen3 1.7B",
    repo: "unsloth/Qwen3-1.7B-GGUF",
    file: "Qwen3-1.7B-Q4_K_M.gguf",
    bytes: 1_107_409_472,
    sha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
    license: "Apache-2.0",
    parameters: "1.7B",
    note: "Smaller and faster, on an older and very well-supported architecture.",
  },
];

export const DEFAULT_MODEL_ID = MODELS[0]!.id;

export const findModel = (id: string): ModelSpec | undefined => MODELS.find((m) => m.id === id);

/**
 * Where the file is fetched from.
 *
 * The plain `resolve` endpoint, which answers with a single 302 to a regional
 * CDN. No token, no custom headers: these repos are public, and needing
 * credentials would mean the app had to hold some.
 */
export const modelUrl = (spec: ModelSpec): string =>
  `https://huggingface.co/${spec.repo}/resolve/main/${spec.file}`;
