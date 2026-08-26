import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(here, "../src/content/docs");
const SITE = "https://mlabel.vlad.gg";

/** Every markdown file under the docs collection, depth-first. */
function pages(dir = CONTENT) {
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pages(full));
    else if (/\.mdx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Pull `title` and `description` out of the frontmatter without a YAML parser. */
function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(match[0].length) };
}

/** `src/content/docs/config/types.md` → `https://mlabel.vlad.gg/config/types/` */
function urlFor(file) {
  const rel = relative(CONTENT, file)
    .replace(/\.mdx?$/, "")
    .split(sep)
    .join("/");
  const slug = rel.replace(/(^|\/)index$/, "");
  return slug === "" ? `${SITE}/` : `${SITE}/${slug}/`;
}

/**
 * Emit `/llms.txt` and `/llms-full.txt`.
 *
 * The audience is an agent writing a config, which is a first-class use case
 * here rather than an afterthought: `llms.txt` is a linked index it can skim,
 * and `llms-full.txt` is every page's prose in one request, so a model can hold
 * the whole schema contract in context without crawling twenty URLs.
 */
export function llmsTxt() {
  return {
    name: "mlabel:llms-txt",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const entries = pages().map((file) => {
          const { meta, body } = frontmatter(readFileSync(file, "utf8"));
          return {
            url: urlFor(file),
            title: meta.title ?? "Untitled",
            description: meta.description ?? "",
            body,
          };
        });

        const index = [
          "# MLabel",
          "",
          "> A fully local, zero-network desktop app for manual data labeling. Everything shown and captured is driven by a single `.jsonc` config file.",
          "",
          `The config JSON Schema is served at ${SITE}/mlabel.schema.json — point a config's \`$schema\` at it for editor validation.`,
          "",
          "## Docs",
          "",
          ...entries.map(
            (e) => `- [${e.title}](${e.url})${e.description ? `: ${e.description}` : ""}`,
          ),
          "",
          "## Full text",
          "",
          `- [Every page in one file](${SITE}/llms-full.txt)`,
          "",
        ].join("\n");

        const full = [
          "# MLabel — complete documentation",
          "",
          `Generated from ${SITE}. Every page, in sidebar order.`,
          "",
          ...entries.map((e) => `---\n\n# ${e.title}\n\nSource: ${e.url}\n\n${e.body.trim()}\n`),
        ].join("\n");

        const out = fileURLToPath(dir);
        writeFileSync(join(out, "llms.txt"), index, "utf8");
        writeFileSync(join(out, "llms-full.txt"), full, "utf8");
        logger.info(`emitted llms.txt (${entries.length} pages) and llms-full.txt`);
      },
    },
  };
}
