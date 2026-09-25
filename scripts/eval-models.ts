/**
 * Run every model in the manifest over real records and report what came back.
 *
 * Dev tooling. Not shipped, not part of `pnpm test` — it wants multi-gigabyte
 * weights and minutes of compute. Run it deliberately:
 *
 *     pnpm build && pnpm eval:models -- --config <path> --data <path.csv>
 *
 * **Why it exists.** Everything else about a model is readable off a manifest:
 * size, licence, architecture. None of that says whether the thing produces
 * usable findings, and the failures that matter here are not the ones you would
 * guess:
 *
 * - An *empty* reply means the text never reached the response channel — the
 *   chat wrapper opened a thought segment the grammar then filled. It looks like
 *   a broken grammar and is nothing of the kind.
 * - A *cut-off* reply means the token cap ended the decode mid-object.
 * - Neither of those is the common one. The common one is a well-formed reply
 *   whose `reasoning` names a real concern and whose `findings` list is empty —
 *   valid, parseable, and useless. A pass criterion of "findings came back"
 *   misses it entirely, which is why this reports that case on its own line.
 *
 * It drives the real `out/main/ai-worker.mjs` through `eval-host.mjs` rather
 * than reimplementing inference, so the prompt, the chat wrapper, the grammar
 * and the parser under test are the ones that ship.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import electronPath from "electron";
import { loadConfig } from "../src/core/config/loader";
import {
  buildOutputJsonSchema,
  buildOutputSchema,
  parseModelOutput,
  type Scopes,
} from "../src/core/ai/schema";
import { buildPrefix, buildSuffix } from "../src/core/ai/prompt";
import { MODELS, type ModelSpec } from "../src/core/ai/models";
import { createDefaultRegistry } from "../src/core/adapters";
import { coerceValue } from "../src/core/coercion";
import type { CoercedValue } from "../src/core/types/values";
import type { RawFieldValue } from "../src/core/types/source";
import type { InputField } from "../src/core/config/schema";
import type { Finding } from "../src/core/ai/types";

interface Args {
  config: string;
  data: string;
  records: number;
  models: string[];
  /**
   * Strip `maxLength` from the schema before handing it to the grammar.
   *
   * An ablation switch, because bounding the free-text fields turned out not to
   * be a uniform improvement: it rescued Ministral 3 and silenced Qwen3.5 4B in
   * the same run. Being able to change that one thing, with the prompt and
   * everything else held still, is the difference between knowing and guessing.
   */
  noBounds: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };
  const config = get("--config");
  const data = get("--data");
  if (!config || !data) {
    throw new Error(
      "usage: eval-models --config <file.jsonc> --data <file.csv> [--records N] [--models a,b]",
    );
  }
  const only = get("--models");
  return {
    config,
    data,
    records: Number(get("--records") ?? 12),
    models: only ? only.split(",") : MODELS.map((m) => m.id),
    noBounds: argv.includes("--no-bounds"),
  };
}

/** Recursively drop every `maxLength`, for the `--no-bounds` ablation. */
function stripMaxLength(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMaxLength);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "maxLength")
      .map(([key, v]) => [key, stripMaxLength(v)]),
  );
}

/** One record's outcome, classified the way the failure modes actually differ. */
type Verdict =
  /** Never reached the response channel. The chat-wrapper failure. */
  | "empty"
  /** Not valid JSON at all. Cut off mid-object by the token cap. */
  | "cutoff"
  /**
   * Valid JSON the schema refused.
   *
   * Distinct from `cutoff` and worth the extra branch: a cut-off decode is a
   * budget problem, while a rejected one is a model writing a complete answer of
   * the wrong shape — an over-long `reason`, a stray key. Reporting both as
   * "truncated" sent me looking at MAX_TOKENS for a fault that was in neither
   * the cap nor the grammar.
   */
  | "rejected"
  /** Valid, and said something. */
  | "findings"
  /** Valid, said nothing, and its reasoning agreed there was nothing. */
  | "clean"
  /** Valid, said nothing, but its own reasoning named a concern. */
  | "silent"
  /** The worker errored or the decode timed out. */
  | "error";

interface Outcome {
  verdict: Verdict;
  ms: number;
  findings: Finding[];
  reasoning: string;
  raw: string;
  error?: string;
}

/**
 * Whether the prose sounds like it found something.
 *
 * A blunt keyword test, and it does not need to be better than blunt: it is not
 * scoring the model, it is separating "said nothing because there was nothing"
 * from "said nothing despite having just described a problem". Over-reporting
 * here costs a line in a table; missing the case entirely is what we are trying
 * to avoid.
 */
const CONCERNED =
  /\b(inconsist|mismatch|contradic|unusual|suspicious|anomal|odd|wrong|invalid|implausib|doesn't match|does not match|out of range|unexpected|conflict|discrepan|typo|malformed|missing|incorrect)/i;

const looksConcerned = (reasoning: string): boolean => CONCERNED.test(reasoning);

/** A single Electron host, reused for every model so we pay startup once. */
class Host {
  #proc: ReturnType<typeof spawn>;
  #waiters = new Map<string, (message: Record<string, unknown>) => void>();
  /**
   * Replies that arrived before anyone asked for them.
   *
   * Electron emits `host-ready` as soon as it is up, which can beat the parent's
   * first `await`. Without somewhere to put an early message the harness waits
   * forever for something that already happened — a hang with no output, which
   * is the least debuggable failure this script could have.
   */
  #early = new Map<string, Record<string, unknown>>();
  #exited = false;

  constructor() {
    // Electron must start as Electron. If ELECTRON_RUN_AS_NODE is set in the
    // environment it runs as plain Node instead, `app` is undefined, and the
    // host dies before printing anything.
    const env = { ...process.env };
    delete env["ELECTRON_RUN_AS_NODE"];

    this.#proc = spawn(electronPath as unknown as string, ["scripts/eval-host.mjs"], {
      stdio: ["pipe", "pipe", "inherit"],
      env,
    });
    this.#proc.on("exit", () => {
      this.#exited = true;
    });
    const lines = createInterface({ input: this.#proc.stdout! });
    lines.on("line", (line) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return; // Electron writes the odd non-JSON warning to stdout.
      }
      const type = String(message["type"]);
      // Worker stderr is forwarded verbatim: a native load failure prints there
      // and nowhere else, and is usually the only evidence of why a model died.
      if (type === "worker-stderr" || type === "worker-stdout") {
        process.stderr.write(String(message["text"]));
        return;
      }
      const key = type === "result" || type === "failed" ? `job:${String(message["id"])}` : type;
      const waiter = this.#waiters.get(key);
      if (waiter) {
        this.#waiters.delete(key);
        waiter(message);
      } else {
        this.#early.set(key, message);
      }
    });
  }

  #send(request: unknown): void {
    this.#proc.stdin!.write(`${JSON.stringify(request)}\n`);
  }

  #await(keys: string[], timeoutMs: number): Promise<Record<string, unknown>> {
    for (const key of keys) {
      const already = this.#early.get(key);
      if (already) {
        this.#early.delete(key);
        return Promise.resolve(already);
      }
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        for (const k of keys) this.#waiters.delete(k);
        reject(new Error(`timed out after ${String(timeoutMs)}ms`));
      }, timeoutMs);
      for (const key of keys) {
        this.#waiters.set(key, (message) => {
          clearTimeout(timer);
          for (const k of keys) this.#waiters.delete(k);
          resolve(message);
        });
      }
    });
  }

  ready(): Promise<Record<string, unknown>> {
    return this.#await(["host-ready"], 60_000);
  }

  /** @returns the resolved chat wrapper's name. */
  async load(modelPath: string, schema: Record<string, unknown>): Promise<string> {
    this.#send({ type: "load", modelPath, schema });
    const message = await this.#await(["loaded", "load-failed"], 300_000);
    if (message["type"] === "load-failed") throw new Error(String(message["error"]));
    return String(message["wrapperName"] ?? "(unreported)");
  }

  async analyze(id: number, prefix: string, suffix: string): Promise<Record<string, unknown>> {
    this.#send({ type: "analyze", id, prefix, suffix });
    return this.#await([`job:${String(id)}`], 120_000);
  }

  stop(): void {
    if (!this.#exited) this.#send({ type: "quit" });
  }
}

function classify(raw: string, scopes: Scopes): Omit<Outcome, "ms"> {
  if (raw.trim() === "") {
    return { verdict: "empty", findings: [], reasoning: "", raw };
  }
  const parsed = parseModelOutput(raw, scopes);
  if (!parsed.ok) {
    // Ask JSON itself rather than inferring from the error text: a reply that
    // parses is a *complete* answer of the wrong shape, one that does not is a
    // decode that stopped early. Those want different fixes.
    let isJson = false;
    try {
      JSON.parse(raw);
      isJson = true;
    } catch {
      isJson = false;
    }
    // The app's message is deliberately vague — a labeler cannot act on a Zod
    // path. Here it is the whole point, so re-run the schema for the detail.
    let why = parsed.error ?? "";
    if (isJson) {
      const check = buildOutputSchema(scopes).safeParse(JSON.parse(raw));
      if (!check.success) {
        why = check.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
      }
    }
    return {
      verdict: isJson ? "rejected" : "cutoff",
      findings: [],
      reasoning: "",
      raw,
      error: why,
    };
  }
  // `reasoning` is scratch space the app never renders, but it is the only way
  // to tell an empty answer that agrees with itself from one that does not.
  let reasoning = "";
  try {
    reasoning = String((JSON.parse(raw) as { reasoning?: unknown }).reasoning ?? "");
  } catch {
    /* already known to parse; ignore */
  }
  if (parsed.findings.length > 0) {
    return { verdict: "findings", findings: parsed.findings, reasoning, raw };
  }
  return {
    verdict: looksConcerned(reasoning) ? "silent" : "clean",
    findings: [],
    reasoning,
    raw,
  };
}

const pct = (n: number, total: number): string =>
  total === 0 ? "—" : `${((n / total) * 100).toFixed(0)}%`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const loaded = loadConfig(readFileSync(args.config, "utf8"));
  if (!loaded.ok) throw new Error(`config did not load: ${JSON.stringify(loaded.issues)}`);
  const cfg = loaded.config;

  // The same registry, adapter and coercion path the app uses, so the values the
  // model sees here are byte-for-byte the ones a labeler would see.
  const registry = createDefaultRegistry();
  const adapter = registry.sourceForExtension(".csv") ?? registry.source(cfg.input.adapterId);
  const { document, issues } = adapter.parse(
    { kind: "content", name: args.data, text: readFileSync(args.data, "utf8") },
    cfg.input.fields.map((f) => f.name),
    cfg.input.adapterConfig,
  );
  const blocking = issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    throw new Error(`input does not match the config: ${JSON.stringify(blocking)}`);
  }
  // Mirrors the coercion half of `buildRecordViews` (src/main/services/pipeline.ts).
  // Not imported: that module resolves `@core`, which tsx does not, and the
  // label-seeding it also does is irrelevant here — the model never sees labels.
  const coerceRow = (
    fields: readonly InputField[],
    row: Readonly<Record<string, RawFieldValue>>,
  ): Record<string, CoercedValue> => {
    const values: Record<string, CoercedValue> = {};
    for (const field of fields) {
      const result = coerceValue(field, row[field.name]);
      values[field.name] = result.ok ? result.value : null;
    }
    return values;
  };

  const records = document.records
    .slice(0, args.records)
    .map((r) => ({ index: r.index, inputValues: coerceRow(cfg.input.fields, r.fields) }));

  const scopes: Scopes = {
    fields: cfg.input.fields.map((f) => f.name),
    cards: (cfg.input.cards ?? []).map((c) => c.name),
  };
  const bounded = buildOutputJsonSchema(scopes);
  const schema = (args.noBounds ? stripMaxLength(bounded) : bounded) as Record<string, unknown>;
  const prefix = buildPrefix(cfg.input.fields, cfg.ai.context);

  console.log(`config: ${args.config}`);
  console.log(`data:   ${args.data} (${String(records.length)} records)`);
  console.log(`prefix: ${String(prefix.length)} chars\n`);

  const host = new Host();
  await host.ready();

  const summaries: {
    spec: ModelSpec;
    wrapper: string;
    counts: Record<Verdict, number>;
    msTotal: number;
    loadMs: number;
    examples: string[];
  }[] = [];

  let jobId = 0;

  for (const id of args.models) {
    const spec = MODELS.find((m) => m.id === id);
    if (!spec) {
      console.error(`unknown model id: ${id}`);
      continue;
    }
    const path = `${process.env["HOME"] ?? ""}/Library/Application Support/mlabel/models/${spec.id}/${spec.file}`;

    process.stderr.write(`\n${spec.name}: loading… `);
    const loadStart = Date.now();
    let wrapper: string;
    try {
      wrapper = await host.load(path, schema);
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const loadMs = Date.now() - loadStart;
    process.stderr.write(`wrapper=${wrapper}, ${String(loadMs)}ms\n`);

    const counts: Record<Verdict, number> = {
      empty: 0,
      cutoff: 0,
      rejected: 0,
      findings: 0,
      clean: 0,
      silent: 0,
      error: 0,
    };
    let msTotal = 0;
    const examples: string[] = [];

    for (const record of records) {
      const suffix = buildSuffix(cfg.input.fields, record.inputValues);
      jobId += 1;
      const started = Date.now();
      let outcome: Omit<Outcome, "ms">;
      try {
        const reply = await host.analyze(jobId, prefix, suffix);
        outcome =
          reply["type"] === "failed"
            ? {
                verdict: "error",
                findings: [],
                reasoning: "",
                raw: "",
                error: String(reply["error"]),
              }
            : classify(String(reply["json"]), scopes);
      } catch (err) {
        outcome = {
          verdict: "error",
          findings: [],
          reasoning: "",
          raw: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
      const ms = Date.now() - started;
      msTotal += ms;
      counts[outcome.verdict] += 1;

      if (outcome.verdict === "findings" && examples.length < 3) {
        examples.push(
          outcome.findings.map((f) => `${f.field ?? f.card ?? "row"}: ${f.reason}`).join(" | "),
        );
      }
      if (outcome.verdict === "silent" && examples.length < 3) {
        examples.push(`(silent) reasoning said: ${outcome.reasoning.slice(0, 140)}`);
      }
      // The reason a schema refused a complete answer is the actionable half of
      // a rejection, and it is the same handful of reasons over and over.
      if (outcome.verdict === "rejected" && examples.length < 5) {
        examples.push(`(rejected) ${outcome.error ?? "unknown"}`);
      }
      // stderr, one line per record: a run is minutes long, and progress piped
      // through anything buffering is progress nobody can see.
      process.stderr.write(
        `  [${spec.id}] record ${String(record.index)}: ${outcome.verdict} ` +
          `(${(ms / 1000).toFixed(1)}s)${outcome.error ? ` — ${outcome.error}` : ""}\n`,
      );
    }
    summaries.push({ spec, wrapper, counts, msTotal, loadMs, examples });
  }

  host.stop();

  console.log("\n\n## Results\n");
  console.log(
    "| Model | Wrapper | Load | Mean/rec | findings | clean | silent | empty | cutoff | rejected | error |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summaries) {
    const n = Object.values(s.counts).reduce((a, b) => a + b, 0);
    console.log(
      `| ${s.spec.name} | ${s.wrapper} | ${(s.loadMs / 1000).toFixed(1)}s | ${(s.msTotal / n / 1000).toFixed(1)}s | ` +
        `${String(s.counts.findings)} (${pct(s.counts.findings, n)}) | ${String(s.counts.clean)} | ` +
        `${String(s.counts.silent)} (${pct(s.counts.silent, n)}) | ${String(s.counts.empty)} | ` +
        `${String(s.counts.cutoff)} | ${String(s.counts.rejected)} | ${String(s.counts.error)} |`,
    );
  }
  console.log("\n### How to read this\n");
  console.log("- **empty** — the reply never reached the response channel. A chat-wrapper");
  console.log("  problem, not a grammar one. Any non-zero count here is a bug, not a score.");
  console.log("- **cutoff** — not valid JSON: the token cap ended the decode mid-object.");
  console.log("- **rejected** — valid JSON the schema refused. A complete answer of the");
  console.log("  wrong shape, which is a different fault from running out of budget.");
  console.log("- **silent** — valid JSON whose reasoning named a concern and whose findings");
  console.log("  list was empty anyway. The dominant failure at small sizes, and invisible");
  console.log("  to any check that only asks whether parsing succeeded.");
  console.log("- **findings** — said something. Whether it was *right* is a separate question");
  console.log("  this harness does not answer; read the examples below.\n");

  for (const s of summaries) {
    if (s.examples.length === 0) continue;
    console.log(`\n**${s.spec.name}**`);
    for (const e of s.examples) console.log(`- ${e}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
