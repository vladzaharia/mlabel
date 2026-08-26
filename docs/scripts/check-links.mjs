import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Fail the build on an internal link that goes nowhere.
 *
 * Starlight already validates sidebar slugs, but nothing checks links inside
 * prose — and a docs site whose cross-references quietly rot is worse than one
 * with fewer of them. Runs over the built output, so it sees exactly what a
 * reader would request.
 *
 * External links are not checked: that needs the network, which would make the
 * build non-hermetic and flaky for a class of breakage nobody here controls.
 */

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");

/** Directories whose contents are emitted by tooling, not authored. */
const GENERATED_PREFIXES = ["/_astro/", "/pagefind/"];

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return htmlFiles(full);
    return entry.endsWith(".html") ? [full] : [];
  });
}

const files = htmlFiles(DIST);
const routeOf = (file) =>
  `/${relative(DIST, file)
    .replace(/index\.html$/, "")
    .replaceAll("\\", "/")}`;

const pages = new Set(files.map(routeOf));
const assets = new Set(
  readdirSync(DIST)
    .filter((entry) => statSync(join(DIST, entry)).isFile())
    .map((entry) => `/${entry}`),
);

const broken = new Map();

for (const file of files) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/href="(\/[^"#?]*)/g)) {
    let href = match[1];
    // Starlight emits directory-style routes; normalise so `/config` matches `/config/`.
    if (!href.endsWith("/") && !href.includes(".")) href += "/";
    if (pages.has(href) || assets.has(href)) continue;
    if (GENERATED_PREFIXES.some((prefix) => href.startsWith(prefix))) continue;
    if (!broken.has(href)) broken.set(href, new Set());
    broken.get(href).add(routeOf(file));
  }
}

if (broken.size > 0) {
  for (const [href, sources] of [...broken].sort()) {
    process.stderr.write(`  ${href}\n      linked from ${[...sources].sort().join(", ")}\n`);
  }
  process.stderr.write(`\n${String(broken.size)} broken internal link target(s).\n`);
  process.exit(1);
}

process.stdout.write(`Checked ${String(files.length)} pages — no broken internal links.\n`);
