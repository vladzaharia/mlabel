import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const origin = process.env.DOCS_PREVIEW_URL ?? "http://127.0.0.1:4321";
const artifacts = process.env.DOCS_REVIEW_DIR ?? "/tmp/mlabel-docs-review";
mkdirSync(artifacts, { recursive: true });
function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? pages(p) : name === "index.html" ? [p] : [];
  });
}
const routes = pages(dist)
  .map((p) => `/${relative(dist, p).replace(/index\.html$/, "")}`)
  .filter(
    (route) =>
      !process.env.DOCS_REVIEW_ROUTES || process.env.DOCS_REVIEW_ROUTES.split(",").includes(route),
  );
const browser = await chromium.launch();
const failures = [];
const summary = [];
const featured = new Set([
  "/",
  "/admin/",
  "/config/widgets/",
  "/config/cookbook/",
  "/config/recipes/audit-trail/",
  "/config/cards/",
  "/guide/labeling/",
  "/preparers/",
]);
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => failures.push(`${page.url()}: ${error.message}`));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of routes) {
      const response = await page.goto(`${origin}${route}`);
      if (response.status() !== 200) failures.push(`${route}: HTTP ${response.status()}`);
      for (const theme of ["light", "dark"]) {
        if (width < 800) await page.locator("starlight-menu-button button").click();
        await page.locator("starlight-theme-select select:visible").first().selectOption(theme);
        if (width < 800) await page.locator("starlight-menu-button button").click();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(
            [...document.images].map(async (img) => {
              img.loading = "eager";
              try {
                await img.decode();
              } catch {}
            }),
          );
        });
        const state = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          h1: document.querySelector("h1")?.textContent,
          images: [...document.images]
            .filter((img) => !img.complete || img.naturalWidth === 0 || !img.alt)
            .map((img) => img.currentSrc),
          pairs: [...document.querySelectorAll(".shot")].filter(
            (shot) =>
              [...shot.querySelectorAll("img")].filter(
                (img) => img.getBoundingClientRect().width > 0,
              ).length !== 1,
          ).length,
          shots: document.querySelectorAll(".shot").length,
        }));
        if (state.overflow || !state.h1 || state.images.length || state.pairs)
          failures.push({ route, width, theme, ...state });
        summary.push({ route, width, theme, shots: state.shots });
        if (featured.has(route) && (theme === "light" || width === 1440)) {
          const slug = route === "/" ? "home" : route.replaceAll("/", "-").replace(/^-|-$/g, "");
          await page.screenshot({
            path: join(artifacts, `${slug}-${width}-${theme}.png`),
            fullPage: true,
          });
        }
      }
    }
    process.stdout.write(`Checked ${routes.length} routes in both themes at ${width}px\n`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/config/recipes/multi-select/`);
  await page.getByText("View the complete configuration", { exact: true }).click();
  if (!(await page.locator("details[open] pre").isVisible()))
    failures.push("Recipe configuration does not expand");
  const download = await page.request.get(`${origin}/examples/cookbook/multi-select/config.jsonc`);
  if (!download.ok() || !(await download.text()).includes('"issues"'))
    failures.push("Recipe download failed");
  await page.goto(origin);
  await page
    .getByRole("button", { name: /Search/ })
    .first()
    .click();
  await page.locator("dialog input").fill("checkboxes");
  await page.locator(".pagefind-ui__result-link").first().waitFor({ timeout: 15000 });
  process.stdout.write("Checked recipe expansion, download, and site search\n");
} finally {
  await browser.close();
  writeFileSync(join(artifacts, "report.json"), JSON.stringify({ summary, failures }, null, 2));
}
if (failures.length) {
  process.stderr.write(`${JSON.stringify(failures, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`Browser checks passed. Review captures: ${artifacts}\n`);
