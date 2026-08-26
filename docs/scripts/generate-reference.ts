import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * Turn `schema/mlabel.schema.json` into browsable reference pages.
 *
 * Generated rather than hand-written so the reference cannot drift from the Zod
 * source: `pnpm schema` emits the JSON Schema, a test in the app repo fails if
 * the committed copy disagrees with the code, and this reads that same file.
 *
 * Two properties of the emitted schema drive the whole design:
 *
 * 1. **`$ref` can carry siblings.** Draft 2020-12 allows `{ description, $ref }`,
 *    and Zod uses it — a key's prose often sits *beside* the reference rather
 *    than inside the target. Descriptions are therefore collected along the
 *    whole chain, nearest first.
 * 2. **Unions are `if`/`then`.** `narrowDiscriminatedUnions` rewrites every
 *    discriminated union so editors narrow properly, which means a field's
 *    per-variant keys live under `allOf[i].then`, not in a flat `properties`.
 *
 * Unhandled shapes throw. A reference page with a silent hole in it is worse
 * than a failed build, because nobody finds out.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(here, "../../schema/mlabel.schema.json");
const OUT = resolve(here, "../src/content/docs/reference");

type Node = Record<string, any>;

const schema: Node = JSON.parse(readFileSync(SCHEMA, "utf8"));
const defs: Node = schema["$defs"] ?? {};

// --- Schema walking --------------------------------------------------------

const refName = (node: Node | undefined): string | undefined => {
  const ref = node?.["$ref"];
  return typeof ref === "string" ? ref.split("/").pop() : undefined;
};

/** Follow `$ref` to the node that actually carries the shape. */
function deref(node: Node | undefined): Node | undefined {
  let current = node;
  for (let hops = 0; current && hops < 20; hops++) {
    const name = refName(current);
    if (name === undefined) return current;
    current = defs[name];
  }
  return current;
}

/** The nearest description along the `$ref` chain. See note 1 above. */
function describe(node: Node | undefined): string {
  let current = node;
  for (let hops = 0; current && hops < 20; hops++) {
    if (typeof current["description"] === "string") return current["description"];
    const name = refName(current);
    if (name === undefined) return "";
    current = defs[name];
  }
  return "";
}

/** The named `$def` a node points at, if it is one the reference documents. */
function namedTarget(node: Node | undefined): string | undefined {
  let current = node;
  for (let hops = 0; current && hops < 20; hops++) {
    const name = refName(current);
    if (name === undefined) return undefined;
    if (PAGES.has(name)) return name;
    current = defs[name];
  }
  return undefined;
}

// --- Rendering -------------------------------------------------------------

const escapeCell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\n+/g, " ");

const code = (text: string): string => `\`${text}\``;

/**
 * A human-readable type expression, linking out to any named shape.
 *
 * Recurses so `array of Choice` reads as such rather than as "array"; the depth
 * cap is belt and braces against a `$ref` cycle the deref guards already cover.
 */
function typeName(node: Node | undefined, depth = 0): string {
  if (!node || depth > 6) return "any";

  const named = namedTarget(node);
  if (named) return `[${named}](/reference/${slug(named)}/)`;

  const resolved = deref(node);
  if (!resolved) return "any";

  if (Array.isArray(resolved["anyOf"])) {
    const branches = resolved["anyOf"] as Node[];
    // A discriminator over nine variants would crush the Type column, and the
    // values are already the headings of the sections directly below. Summarise
    // instead of enumerating.
    if (branches.length > 4 && branches.every((b) => b["const"] !== undefined)) {
      return `one of ${String(branches.length)} values — see below`;
    }
    const parts = branches.map((b) =>
      b["const"] === undefined ? typeName(b, depth + 1) : code(JSON.stringify(b["const"])),
    );
    return [...new Set(parts)].join(" \\| ");
  }
  if (Array.isArray(resolved["oneOf"])) {
    return [...new Set((resolved["oneOf"] as Node[]).map((b) => typeName(b, depth + 1)))].join(
      " \\| ",
    );
  }
  if (resolved["const"] !== undefined) return code(JSON.stringify(resolved["const"]));
  if (Array.isArray(resolved["enum"])) {
    return (resolved["enum"] as unknown[]).map((v) => code(JSON.stringify(v))).join(" \\| ");
  }

  switch (resolved["type"]) {
    case "array":
      return `array of ${typeName(resolved["items"] as Node, depth + 1)}`;
    case "object":
      return resolved["properties"] ? "object" : "object";
    case "integer":
      return "integer";
    case "number":
    case "string":
    case "boolean":
      return String(resolved["type"]);
    default:
      return "any";
  }
}

/**
 * Constraints worth showing beside a key, e.g. `≥ 1`, `matches …`.
 *
 * Zod expresses `.int()` as a ±`Number.MAX_SAFE_INTEGER` range. That is true and
 * useless — printing "≤ 9007199254740991" beside every integer buries the
 * constraints an author can act on, so the safe-integer bounds are dropped.
 */
function constraints(node: Node | undefined): string {
  const n = deref(node);
  if (!n) return "";
  const bound = (value: unknown): boolean =>
    typeof value === "number" && Math.abs(value) !== Number.MAX_SAFE_INTEGER;

  const parts: string[] = [];
  if (typeof n["minLength"] === "number" && n["minLength"] > 0)
    parts.push(`min length ${String(n["minLength"])}`);
  if (typeof n["maxLength"] === "number") parts.push(`max length ${String(n["maxLength"])}`);
  if (bound(n["minimum"])) parts.push(`≥ ${String(n["minimum"])}`);
  if (bound(n["exclusiveMinimum"])) parts.push(`> ${String(n["exclusiveMinimum"])}`);
  if (bound(n["maximum"])) parts.push(`≤ ${String(n["maximum"])}`);
  if (typeof n["minItems"] === "number" && n["minItems"] > 0)
    parts.push(`at least ${String(n["minItems"])} item${n["minItems"] === 1 ? "" : "s"}`);
  if (typeof n["pattern"] === "string") parts.push(`matches ${code(n["pattern"])}`);
  if (n["default"] !== undefined) parts.push(`default ${code(JSON.stringify(n["default"]))}`);
  return parts.join(", ");
}

/**
 * One markdown table of an object's own keys.
 *
 * `skip` drops keys a reader has already seen — a variant table that repeated
 * `name` and `display` under all nine types would bury the two or three keys
 * that actually distinguish the variant.
 */
function propertyTable(node: Node, skip: ReadonlySet<string> = new Set()): string {
  const properties = (node["properties"] ?? {}) as Node;
  const names = Object.keys(properties).filter((name) => !skip.has(name));
  if (names.length === 0) return "_No keys beyond the shared ones._\n";

  const required = new Set((node["required"] ?? []) as string[]);
  const rows = names.map((name) => {
    const value = properties[name] as Node;
    const flag = required.has(name) ? "**yes**" : "no";
    const extra = constraints(value);
    const prose = escapeCell(describe(value));
    return `| ${code(name)} | ${typeName(value)} | ${flag} | ${escapeCell(
      [prose, extra && `_${extra}_`].filter(Boolean).join(" "),
    )} |`;
  });

  return ["| Key | Type | Required | Notes |", "| --- | --- | --- | --- |", ...rows, ""].join("\n");
}

/**
 * The variant branches of an `if`/`then` union, if this node is one.
 *
 * Returns the discriminator value alongside the branch so the page can be
 * ordered and headed by the tag an author actually writes.
 */
function variants(node: Node): { tag: string; value: string; body: Node }[] | undefined {
  const allOf = node["allOf"] as Node[] | undefined;
  if (!Array.isArray(allOf) || allOf.length === 0 || !allOf[0]?.["if"]) return undefined;

  return allOf.map((branch) => {
    const condition = branch["if"]["properties"] as Node;
    const tag = Object.keys(condition)[0] as string;
    const body = deref(branch["then"] as Node);
    if (!body) throw new Error(`Unresolvable branch in a union on "${tag}".`);
    return { tag, value: String(condition[tag]["const"]), body };
  });
}

const slug = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

// --- Pages -----------------------------------------------------------------

/** Order matters: it is the sidebar order under "Schema reference". */
const PAGE_ORDER: [name: string, blurb: string][] = [
  ["InputField", "Every key legal on a field in `input.fields`, by type."],
  ["OutputField", "Every key legal on a field in `output.fields`, by type."],
  ["ValueType", "An unnamed type — what `array.items`, `map.values` and `map.keys` hold."],
  ["NestedField", "A named member inside an `object` type."],
  ["Fill", "Where an output field's value comes from."],
  ["Choice", "One option of an `enum`."],
  ["Card", "A group of fields under a heading."],
  ["CardRow", "One row inside a card."],
  ["DisplayRule", "A purely visual rule over input values."],
  ["Condition", "The trigger half of a display rule."],
  ["Style", "The tone and note a rule applies."],
  ["TextDisplay", "Captions for a choice, card or column."],
  ["FieldDisplay", "Captions plus layout, for a field."],
  ["TableView", "How an object renders as a table."],
  ["TableColumn", "One column of that table."],
];

const PAGES = new Set(PAGE_ORDER.map(([name]) => name));

function frontmatter(title: string, description: string, order: number): string {
  const escape = (text: string): string => text.replace(/"/g, '\\"');
  return [
    "---",
    `title: ${title}`,
    `description: "${escape(description)}"`,
    "sidebar:",
    `  order: ${String(order)}`,
    "---",
    "",
    // An HTML comment, not the MDX `{/* … */}` form: these are `.md` files, and
    // a JSX comment there renders as literal text on the page.
    "<!-- Generated by docs/scripts/generate-reference.ts — do not edit. -->",
    "",
  ].join("\n");
}

function renderPage(name: string, blurb: string, order: number): string {
  const def = defs[name] as Node | undefined;
  if (!def) {
    throw new Error(`Schema has no $def named "${name}". Run \`pnpm schema\` in the repo root.`);
  }

  const prose = describe(def);
  const out = [frontmatter(name, blurb, order)];
  if (prose) out.push(`${prose}\n`);

  const branches = variants(def);
  if (!branches) {
    out.push(propertyTable(def));
    return out.join("\n");
  }

  const tag = branches[0]!.tag;
  const shared = new Set(Object.keys((def["properties"] ?? {}) as Node));
  out.push(
    `Every variant shares the keys below. Which further keys are legal depends on ${code(tag)}.\n`,
  );
  out.push(propertyTable(def));

  for (const { value, body } of branches) {
    const options = def["properties"][tag]["anyOf"] as Node[];
    const own = describe(options.find((b) => b["const"] === value));
    out.push(`## ${code(`"${tag}": "${value}"`)}\n`);
    if (own) out.push(`${own}\n`);
    out.push(propertyTable(body, shared));
  }

  return out.join("\n");
}

/**
 * The top-level config object, with its anonymous nested objects expanded.
 *
 * `input` and `output` have no `.meta({ id })` — they exist only here, so they
 * get no `$def` name and no page of their own. Rendering them inline is what
 * makes `input.fields` and `output.adapterConfig` findable at all; without it
 * the root page would say "object" four times and dead-end.
 */
function renderRoot(): string {
  const out = [
    frontmatter("The config object", "Every top-level key of an MLabel `.jsonc` config.", 0),
    "The root of every config file.\n",
    propertyTable(schema),
  ];

  for (const [key, value] of Object.entries((schema["properties"] ?? {}) as Node)) {
    if (namedTarget(value as Node)) continue;
    const resolved = deref(value as Node);
    if (!resolved?.["properties"]) continue;
    out.push(`\n## ${code(key)}\n`);
    const prose = describe(value as Node);
    if (prose) out.push(`${prose}\n`);
    out.push(propertyTable(resolved));
  }

  out.push(
    "\n:::tip",
    "Point your config's `$schema` at `https://mlabel.vlad.gg/mlabel.schema.json` for autocomplete and inline validation in any editor that understands JSON Schema.",
    ":::",
    "",
  );
  return out.join("\n");
}

// --- Emit ------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.md"), renderRoot(), "utf8");

PAGE_ORDER.forEach(([name, blurb], index) => {
  writeFileSync(join(OUT, `${slug(name)}.md`), renderPage(name, blurb, index + 1), "utf8");
});

// Anything named in the schema but missing from PAGE_ORDER would be silently
// undocumented, which is exactly the failure this generator exists to prevent.
const undocumented = Object.keys(defs).filter(
  (name) => !name.startsWith("__schema") && !PAGES.has(name),
);
if (undocumented.length > 0) {
  throw new Error(
    `These named schemas have no reference page: ${undocumented.join(", ")}. ` +
      `Add them to PAGE_ORDER in docs/scripts/generate-reference.ts.`,
  );
}

process.stdout.write(`Generated ${String(PAGE_ORDER.length + 1)} reference pages in ${OUT}\n`);
