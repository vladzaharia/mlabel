import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type Locator, type Page } from "playwright";

// Real application controls, using synthetic data and an isolated offline session.
// Run after `pnpm build`: `pnpm -C docs field-previews` (macOS).
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shots = join(repo, "docs/src/assets/shots");
const dir = mkdtempSync("/tmp/mlabel-field-guide-");
const choices = [
  { name: "positive", display: "Positive" },
  { name: "negative", display: "Negative" },
  { name: "unclear", display: "Unclear" },
];
const output = [
  { name: "text", type: "text", display: "Short explanation" },
  { name: "textarea", type: "text", widget: "textarea", display: "Review notes", required: false },
  { name: "integer", type: "integer", min: 1, max: 5, display: "Rating (1–5)" },
  { name: "number", type: "number", min: 0, max: 1, step: 0.01, display: "Confidence (0–1)" },
  {
    name: "slider",
    type: "integer",
    widget: "slider",
    min: 1,
    max: 5,
    step: 1,
    display: "Rating (1–5)",
  },
  { name: "checkbox", type: "boolean", display: "Needs follow-up" },
  { name: "date", type: "date", display: "Review date" },
  { name: "radio", type: "enum", widget: "radio", display: "How does the customer feel?", choices },
  { name: "select", type: "enum", display: "Sentiment", choices },
  {
    name: "checkboxes",
    type: "array",
    display: "Issues to report",
    required: false,
    items: {
      type: "enum",
      choices: [
        { name: "delivery", display: "Delivery" },
        { name: "packaging", display: "Packaging" },
      ],
    },
  },
];
const input = [
  { name: "comment", type: "text", display: { title: "Customer comment", titlePosition: "above" } },
  {
    name: "tags",
    type: "array",
    items: { type: "text" },
    display: { title: "Tags", titlePosition: "above" },
  },
  {
    name: "details",
    type: "object",
    fields: [
      { name: "region", type: "text" },
      { name: "orders", type: "integer" },
    ],
    display: { title: "Customer details", titlePosition: "above" },
  },
  {
    name: "history",
    type: "array",
    items: {
      type: "object",
      fields: [
        { name: "date", type: "date" },
        { name: "delivered", type: "boolean" },
      ],
    },
    display: { title: "Delivery history", titlePosition: "above" },
  },
  {
    name: "counts",
    type: "map",
    values: { type: "integer" },
    display: { title: "Items by category", titlePosition: "above" },
  },
];
const config = {
  version: 2,
  network: { updateChecks: false },
  input: { fields: input },
  output: { fields: output },
};
writeFileSync(join(dir, "config.jsonc"), JSON.stringify(config, null, 2));
const cells = [
  "The package arrived damaged.",
  '["delivery","packaging"]',
  '{"region":"West","orders":3}',
  '[{"date":"2026-10-01","delivered":true},{"date":"2026-10-02","delivered":false}]',
  '{"books":2,"clothing":1}',
];
const csv = join(dir, "field-guide.csv");
writeFileSync(
  csv,
  `${input.map((f) => f.name).join(",")}\n${cells.map((v) => `"${v.replaceAll('"', '""')}"`).join(",")}\n`,
);
mkdirSync(shots, { recursive: true });

async function capture(page: Page, target: Locator, name: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      theme === "dark",
    );
    await page.waitForTimeout(200);
    await target.screenshot({ path: join(shots, `${name}.${theme}.png`) });
  }
  process.stdout.write(`Captured ${name}\n`);
}

const app = await electron.launch({
  args: [repo, `--user-data-dir=${join(dir, "userdata")}`],
  cwd: dir,
});
try {
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
  await page.getByRole("heading", { level: 1 }).waitFor();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, csv);
  await page.getByRole("button", { name: /select input/i }).click();
  await page.locator("#field-text").waitFor();
  await page.getByRole("textbox", { name: "Short explanation" }).fill("Packaging was torn.");
  await page
    .getByRole("textbox", { name: "Review notes" })
    .fill(
      "The customer describes damage to the package. Check the project guidance for follow-up.",
    );
  await page.locator("#field-integer input").fill("4");
  await page.locator("#field-number input").fill("0.75");
  await page.getByRole("slider").focus();
  await page.keyboard.press("ArrowRight");
  await page.locator("#field-checkbox").getByRole("checkbox").click();
  await page.locator("#field-date input").fill("2026-10-09");
  await page.getByRole("radio", { name: "Negative", exact: true }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Negative", exact: true }).click();
  await page
    .locator("#field-checkboxes")
    .getByRole("checkbox", { name: "Packaging", exact: true })
    .click();
  // Move focus away so the previews describe the control, not a transient focus ring.
  await page.getByRole("heading", { level: 1 }).focus();
  for (const field of output)
    await capture(page, page.locator(`#field-${field.name}`), `field-${field.name}`);
  const inputCard = page
    .locator("section")
    .filter({ has: page.getByText("Customer details", { exact: true }) })
    .first();
  await capture(page, inputCard, "input-types");
  await page.locator("#field-integer input").fill("9");
  await page.getByRole("heading", { level: 1 }).focus();
  await capture(page, page.locator("#field-integer"), "field-invalid");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await capture(page, page.getByRole("dialog"), "settings-keys");
  await page.getByRole("tab", { name: "Session", exact: true }).click();
  await capture(page, page.getByRole("dialog"), "settings-session");
} finally {
  await app.close();
}
