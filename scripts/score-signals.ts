/**
 * Score a set of signals against human labels.
 *
 *     pnpm score -- --config c.jsonc --data rows.csv --labels labelled.csv
 *     pnpm score -- ... --flagged verdicts.json
 *
 * Two questions, one answer shape. With no `--flagged`, it scores the config's
 * own display rules, evaluated through the app's real loader and evaluator so
 * the numbers describe what a labeler actually sees. With `--flagged` — a JSON
 * array of `{ guid, flagged }` or a bare array of flagged guids — it scores
 * anything else that produced a verdict, which is how a model gets compared
 * against the rules it is meant to beat.
 *
 * Precision is the number that matters here and recall is the check on it: a
 * rule firing on three rows can be perfect and useless, so both are reported
 * next to the support. Lift is against the file's own base rate, because "90%
 * bot" means something very different in a file that is 20% bot than in one
 * that is 60% bot.
 */

import { readFileSync } from "node:fs";
import { loadConfig } from "../src/core/config/loader";
import { coerceValue } from "../src/core/coercion";
import { evaluateDecorations } from "../src/core/decorations";
import type { AppConfig } from "../src/core/config";

interface Args {
  config?: string;
  data?: string;
  labels?: string;
  flagged?: string;
  /** Which label counts as positive. Required — see `main`. */
  positive?: string;
}

/**
 * Flags in any order, tolerating the bare `--` that `pnpm run` forwards.
 *
 * Pair-wise scanning looked simpler and silently mis-paired every flag as soon
 * as that `--` appeared in front of them.
 */
function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined || !token.startsWith("--") || token === "--") continue;
    const key = token.slice(2) as keyof Args;
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith("--")) {
      out[key] = value;
      i++;
    }
  }
  return out;
}

/**
 * A minimal CSV reader: quoted fields, embedded commas and newlines.
 *
 * Deliberately not the CSV adapter. That one parses a file against a loaded
 * config and hands back opaque provenance; a two-column label export is
 * neither, and reaching into the adapter's internals is exactly what the
 * import rule forbids.
 */
function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const head = rows.shift();
  if (!head) return [];
  return rows
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export interface Score {
  label: string;
  /** Rows the signal fired on. */
  fired: number;
  /** Share of those that were positive. */
  precision: number;
  /** Share of all positives that it caught. */
  recall: number;
  /** Precision over the base rate. 1.0 is a signal that says nothing. */
  lift: number;
}

export function score(
  label: string,
  hits: readonly boolean[],
  positives: readonly boolean[],
  base: number,
): Score {
  let fired = 0;
  let truePositives = 0;
  for (const [i, hit] of hits.entries()) {
    if (!hit) continue;
    fired += 1;
    if (positives[i]) truePositives += 1;
  }
  const totalPositive = positives.filter(Boolean).length;
  return {
    label,
    fired,
    precision: fired === 0 ? 0 : truePositives / fired,
    recall: totalPositive === 0 ? 0 : truePositives / totalPositive,
    lift: fired === 0 || base === 0 ? 0 : truePositives / fired / base,
  };
}

/** Which rules fired on one record, across all three decoration scopes. */
function rulesFiredOn(config: AppConfig, row: Record<string, string>): Set<string> {
  const values: Record<string, unknown> = {};
  for (const field of config.input.fields) {
    const result = coerceValue(field, row[field.name] ?? "", [field.name]);
    values[field.name] = result.ok ? result.value : null;
  }
  const decorations = evaluateDecorations(config.input.rules, values as never);
  const names = new Set<string>();
  for (const list of [...decorations.fields.values(), ...decorations.cards.values()]) {
    for (const decoration of list) names.add(decoration.rule);
  }
  for (const itemRows of decorations.items.values()) {
    for (const list of itemRows) for (const decoration of list) names.add(decoration.rule);
  }
  return names;
}

function table(rows: Score[]): string {
  const width = Math.max(24, ...rows.map((r) => r.label.length));
  const head = `${"signal".padEnd(width)} ${"fires".padStart(6)} ${"prec".padStart(7)} ${"recall".padStart(7)} ${"lift".padStart(6)}`;
  const body = rows.map(
    (r) =>
      `${r.label.padEnd(width)} ${String(r.fired).padStart(6)} ${(r.precision * 100).toFixed(1).padStart(6)}% ${(r.recall * 100).toFixed(1).padStart(6)}% ${r.lift.toFixed(2).padStart(6)}`,
  );
  return [head, "-".repeat(head.length), ...body].join("\n");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.data || !args.labels) {
    console.error("need --data <rows.csv> --labels <labelled.csv>");
    console.error("and either --config <c.jsonc> or --flagged <verdicts.json>");
    process.exit(2);
  }

  const labelRows = readCsv(args.labels);
  const labelKey = Object.keys(labelRows[0] ?? {}).find((k) => k === "label") ?? "label";
  const labels = new Map(labelRows.map((r) => [r["guid"] ?? "", r[labelKey] ?? ""]));

  const data = readCsv(args.data).filter((r) => labels.has(r["guid"] ?? ""));
  if (data.length === 0) {
    console.error("no rows in --data carry a guid present in --labels");
    process.exit(1);
  }

  const counts = new Map<string, number>();
  for (const row of data) {
    const l = labels.get(row["guid"] ?? "") ?? "";
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }

  // Asked for, never guessed. Defaulting to the rarer class looked reasonable
  // and silently inverted every number on the first real file: the rules here
  // hunt the *majority* class, so every precision came back as its complement
  // and the best rule in the set read as the worst.
  const positive = args.positive;
  if (positive === undefined || !counts.has(positive)) {
    const available = [...counts]
      .toSorted((a, b) => b[1] - a[1])
      .map(([l, n]) => `${l} (${String(n)})`)
      .join(", ");
    console.error(`--positive is required. Classes in this file: ${available}`);
    process.exit(2);
  }
  const positives = data.map((r) => labels.get(r["guid"] ?? "") === positive);
  const base = positives.filter(Boolean).length / data.length;

  console.log(
    `rows ${data.length}   positive class "${positive}"   base rate ${(base * 100).toFixed(1)}%\n`,
  );

  if (args.flagged) {
    const raw: unknown = JSON.parse(readFileSync(args.flagged, "utf8"));
    const flagged = new Set<string>(
      Array.isArray(raw)
        ? raw.map((entry) =>
            typeof entry === "string" ? entry : String((entry as { guid?: unknown }).guid ?? ""),
          )
        : [],
    );
    console.log(
      table([
        score(
          "flagged",
          data.map((r) => flagged.has(r["guid"] ?? "")),
          positives,
          base,
        ),
      ]),
    );
    return;
  }

  const loaded = loadConfig(readFileSync(args.config!, "utf8"));
  if (!loaded.ok) {
    console.error(loaded.issues);
    process.exit(1);
  }
  const config = loaded.config;

  const firedPerRow = data.map((row) => rulesFiredOn(config, row));
  const declared = (config.input.rules ?? []).map((r) => r.name);

  const perRule = declared
    .map((name) =>
      score(
        name,
        firedPerRow.map((names) => names.has(name)),
        positives,
        base,
      ),
    )
    .filter((s) => s.fired > 0)
    .toSorted((a, b) => b.precision - a.precision || b.fired - a.fired);
  console.log(table(perRule));

  const never = declared.filter((n) => !firedPerRow.some((names) => names.has(n)));
  if (never.length > 0) console.log(`\nnever fired: ${never.join(", ")}`);

  // What a reviewer actually sees, which is the union rather than any one rule.
  const alerting = new Set(
    (config.input.rules ?? [])
      .filter((r) => r.style.tone === "warning" || r.style.tone === "danger")
      .map((r) => r.name),
  );
  console.log(
    `\n${table([
      score(
        "any warning/danger rule",
        firedPerRow.map((names) => [...names].some((n) => alerting.has(n))),
        positives,
        base,
      ),
    ])}`,
  );
}

main();
