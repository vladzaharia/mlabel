/**
 * The models this app will download, and nothing else.
 *
 * Every field here is pinned in source rather than discovered at runtime. That
 * is the point: a download whose URL, size and hash are all decided by the
 * remote end is not a download you can reason about. The app fetches exactly one
 * of these files, checks it against the SHA256 below, and refuses anything else.
 *
 * Verified live against the Hugging Face API: every repo is public, ungated and
 * Apache-2.0, and the files fetch with a plain anonymous GET.
 *
 * The weights come from Unsloth rather than from each model's own publisher.
 * Most of these lines ship no GGUF at all, and Unsloth's dynamic quantisation
 * (`UD-*`) chooses a precision per layer instead of applying one to the whole
 * file, which buys back most of what 4-bit costs for a few percent more bytes.
 * Trusting a requantiser is only acceptable because the hash is pinned — a
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
 * Offered smallest-first, because that is the order a download list should read
 * in. Which one is the *default* is a separate question — see
 * `DEFAULT_MODEL_ID`, which names it rather than taking whatever sorts first.
 *
 * The list deliberately spans two model families on three architectures. If a
 * llama.cpp regression breaks one of them, the others are unaffected — which is
 * the job `qwen3-1.7b` used to do, done better by models worth choosing on their
 * own merits rather than only as a fallback.
 */
export const MODELS: readonly ModelSpec[] = [
  {
    id: "qwen3.5-2b",
    name: "Qwen3.5 2B",
    repo: "unsloth/Qwen3.5-2B-GGUF",
    file: "Qwen3.5-2B-UD-Q4_K_XL.gguf",
    bytes: 1_339_752_704,
    sha256: "0af96165ea615bea39a04118d63f0b6d35908aea850ee4a51aa6151d851b8b35",
    license: "Apache-2.0",
    parameters: "2.3B",
    note: "Smallest download. Flags the least reliably of the five.",
  },
  {
    id: "ministral-3-3b",
    name: "Ministral 3 3B",
    repo: "unsloth/Ministral-3-3B-Instruct-2512-GGUF",
    file: "Ministral-3-3B-Instruct-2512-UD-Q4_K_XL.gguf",
    bytes: 2_191_963_424,
    sha256: "c11f7554656fe23d608d8bfac849d7ee3ce3cb00557416afa3cfa8e9b8ede9c2",
    license: "Apache-2.0",
    parameters: "3.4B",
    note: "Raises the most by far. Many will not be worth the look.",
  },
  {
    id: "gemma-4-e2b",
    name: "Gemma 4 E2B",
    repo: "unsloth/gemma-4-E2B-it-qat-GGUF",
    file: "gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf",
    bytes: 2_620_370_976,
    sha256: "e531007218dfab990486a5de7676a6932d6ea8dea233d1f698d7c21cf8a16889",
    license: "Apache-2.0",
    parameters: "2B active",
    note: "The default. Speaks up rarely, and is right most often when it does.",
  },
  {
    id: "qwen3.5-4b",
    name: "Qwen3.5 4B",
    repo: "unsloth/Qwen3.5-4B-GGUF",
    file: "Qwen3.5-4B-UD-Q4_K_XL.gguf",
    bytes: 2_912_109_728,
    sha256: "b252c5610a42ca82d20fe2a12813e9d069eed89292907e26c783eeb0bc961bc7",
    license: "Apache-2.0",
    parameters: "4.2B",
    note: "Slower than the 2B, and no more dependable in what it raises.",
  },
  {
    id: "gemma-4-e4b",
    name: "Gemma 4 E4B",
    repo: "unsloth/gemma-4-E4B-it-qat-GGUF",
    file: "gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf",
    bytes: 4_215_695_776,
    sha256: "df0fd4ee07072c607c29a0a1cb4f98918426cca12f45a2776bdd6ee6d09a4de3",
    license: "Apache-2.0",
    parameters: "4B active",
    note: "The largest download. So cautious it almost never says anything.",
  },
];

/**
 * Named, not derived, and chosen on measured precision.
 *
 * It used to be `MODELS[0]`, which made "cheapest to download" the criterion by
 * accident. Scored against human labels over the same 150 records, on a file
 * where 60% of rows were positive — so 60% precision is what guessing gets:
 *
 *   the config's own rules   87 flagged   89.7% precision   lift 1.49
 *   Gemma 4 E2B              40 flagged   75.0%             lift 1.26
 *   Ministral 3 3B          130 flagged   62.3%             lift 1.04
 *   Qwen3.5 4B               40 flagged   47.5%             lift 0.80
 *   Qwen3.5 2B               61 flagged   44.3%             lift 0.74
 *   Gemma 4 E4B               1 flagged    0.0%             lift 0.00
 *
 * Gemma 4 E2B is the only one of the five that carries information, and it is
 * also the quickest per record. The previous default was flagging rows that were
 * *less* likely than average to be what the labeler was hunting — worse than
 * saying nothing, in a feature whose whole risk is anchoring someone's judgement.
 *
 * The rules row is there to keep the rest honest: a hand-written rule beat every
 * model on this task by a distance, which is the first thing a config author
 * should try.
 *
 * One file and one kind of task, so this is a default and not a verdict. Re-run
 * `pnpm eval:models --flagged-dir …` and `pnpm score` before assuming it holds
 * elsewhere.
 */
export const DEFAULT_MODEL_ID = "gemma-4-e2b";

export const findModel = (id: string): ModelSpec | undefined => MODELS.find((m) => m.id === id);

/**
 * Where the file is fetched from.
 *
 * The plain `resolve` endpoint, which answers with a single 302 to a regional
 * CDN. No token, no custom headers: these repos are public, and needing
 * credentials would mean the app had to hold some.
 *
 * `main` is a moving ref, which would be alarming on its own — but the pinned
 * SHA256 turns "the upload changed" into a failed check rather than a different
 * model running under the same name.
 */
export const modelUrl = (spec: ModelSpec): string =>
  `https://huggingface.co/${spec.repo}/resolve/main/${spec.file}`;
