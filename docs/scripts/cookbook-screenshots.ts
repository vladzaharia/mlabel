import { cpSync, mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type Locator, type Page } from "playwright";

// Capture the exact downloadable examples, through the real renderer and IPC.
// Build the app first. Each run uses isolated data and config-disabled update checks.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shots = join(repo, "docs/src/assets/shots");
const examples = join(repo, "docs/public/examples/cookbook");
const recipes = [
  "multi-select",
  "audit-trail",
  "rename-column",
  "nested-table",
  "dictionary",
  "highlight-input",
  "offline",
  "semicolon",
  "three-key",
  "optional-notes",
  "layout",
  "captions",
  "tones",
  "list-rules",
];
mkdirSync(shots, { recursive: true });

async function capture(page: Page, target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    await page.waitForTimeout(200);
    await target.screenshot({ path: join(shots, `recipe-${name}.${theme}.png`) });
  }
  process.stdout.write(`Captured ${name}\n`);
}

for (const slug of recipes.filter((name) => !process.argv[2] || name === process.argv[2])) {
  const dir = mkdtempSync(`/tmp/mlabel-${slug}-`);
  cpSync(join(examples, slug, "config.jsonc"), join(dir, "config.jsonc"));
  cpSync(join(examples, slug, "data.csv"), join(dir, "data.csv"));
  const app = await electron.launch({
    args: [repo, `--user-data-dir=${join(dir, "userdata")}`],
    cwd: dir,
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
    await page.getByRole("button", { name: /select input/i }).waitFor();
    await app.evaluate(
      ({ dialog }, path) => {
        dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
      },
      join(dir, "data.csv"),
    );
    await page.getByRole("button", { name: /select input/i }).click();
    if (slug === "audit-trail") {
      await page.getByRole("textbox", { name: "Your name" }).fill("Alex");
      await page.getByRole("radio", { name: "Version 4", exact: true }).click();
      await page.getByRole("heading", { level: 1 }).focus();
      await capture(page, page.locator(".glass-card").first(), "audit-setup");
      await page.getByRole("button", { name: "Start labeling", exact: true }).click();
    }
    await page.locator("section").first().waitFor();
    const cards = page.locator("section");
    const field = (name: string) => page.locator(`#field-${name}`);
    if (slug === "multi-select") {
      await page.getByRole("checkbox", { name: /Late delivery/ }).click();
      await page.getByRole("checkbox", { name: /Damaged packaging/ }).click();
      await page.getByRole("heading", { level: 1 }).focus();
      await capture(page, field("issues"), slug);
    } else if (
      ["nested-table", "dictionary", "highlight-input", "tones", "list-rules"].includes(slug)
    ) {
      await capture(page, cards.first(), slug);
    } else if (slug === "layout") {
      await capture(page, cards.first().locator(".."), slug);
      await capture(page, cards.nth(1), "layout-metadata");
    } else if (slug === "captions") {
      await capture(page, cards.first(), slug);
      await cards.first().getByRole("button").first().click();
      await page.getByRole("dialog").waitFor();
      await capture(page, page.getByRole("dialog"), "help");
      await page.keyboard.press("Escape");
      await page.getByRole("radio", { name: "Fail", exact: true }).click();
      await page.getByRole("heading", { level: 1 }).focus();
      await capture(page, field("verdict"), "selected-choice");
    } else if (slug === "offline") {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("tab", { name: "Version", exact: true }).click();
      await capture(page, page.getByRole("dialog"), slug);
    } else if (slug === "optional-notes") {
      await page
        .getByRole("textbox", { name: "Notes" })
        .fill("The customer describes both a delay and damage to the packaging.");
      await page.getByRole("heading", { level: 1 }).focus();
      await capture(page, field("notes"), slug);
    } else {
      await page.getByRole("radio").first().click();
      await page.getByRole("heading", { level: 1 }).focus();
      await capture(page, field("verdict"), slug);
      if (slug === "rename-column" || slug === "semicolon")
        await capture(page, cards.first(), `${slug}-input`);
    }
    // Save through the actual UI and keep the result as a checked example artifact.
    if (
      [
        "multi-select",
        "audit-trail",
        "rename-column",
        "semicolon",
        "three-key",
        "optional-notes",
      ].includes(slug)
    ) {
      if (slug === "optional-notes") await page.getByRole("radio").first().click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("heading", { name: /nice work/i }).waitFor();
      const output = readFileSync(join(dir, "data-output.csv"), "utf8");
      process.stdout.write(`${slug} exported: ${output.trim().replaceAll("\n", " | ")}\n`);
    }
  } finally {
    await app.close();
  }
}
