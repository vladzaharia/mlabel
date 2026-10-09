import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

// Check the built site, including section links and downloadable example files.
// External destinations are intentionally not fetched during a documentation build.
const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const ORIGIN = "https://docs.invalid";
function htmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const file = join(dir, entry);
    return statSync(file).isDirectory() ? htmlFiles(file) : entry.endsWith(".html") ? [file] : [];
  });
}
const routeOf = (file) =>
  `/${relative(DIST, file)
    .replace(/index\.html$/, "")
    .replaceAll("\\", "/")}`;
const pages = new Map(
  htmlFiles(DIST).map((file) => {
    const html = readFileSync(file, "utf8");
    return [
      routeOf(file),
      { html, ids: new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])) },
    ];
  }),
);
const broken = new Map();
for (const [route, { html }] of pages) {
  for (const match of html.matchAll(/\bhref="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), `${ORIGIN}${route}`);
    if (url.origin !== ORIGIN) continue;
    let path = decodeURIComponent(url.pathname);
    if (!path.endsWith("/") && !path.includes(".")) path += "/";
    const target = pages.get(path);
    const anchor = decodeURIComponent(url.hash.slice(1));
    if (target && (!anchor || target.ids.has(anchor))) continue;
    const asset = join(DIST, path.slice(1));
    if (!target && existsSync(asset) && statSync(asset).isFile()) continue;
    const href = `${path}${url.hash}`;
    if (!broken.has(href)) broken.set(href, new Set());
    broken.get(href).add(route);
  }
}
if (broken.size) {
  for (const [href, sources] of [...broken].sort())
    process.stderr.write(`${href}\n  linked from ${[...sources].join(", ")}\n`);
  process.stderr.write(`${broken.size} broken link target(s).\n`);
  process.exit(1);
}
process.stdout.write(
  `Checked ${pages.size} pages, section links, and local downloads — no broken internal links.\n`,
);
