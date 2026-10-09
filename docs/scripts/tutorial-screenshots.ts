import { cpSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = mkdtempSync("/tmp/mlabel-first-project-");
cpSync(join(repo, "docs/public/examples/review.jsonc"), join(dir, "config.jsonc"));
cpSync(join(repo, "docs/public/examples/review.csv"), join(dir, "review.csv"));
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
    join(dir, "review.csv"),
  );
  await page.getByRole("button", { name: /select input/i }).click();
  await page.getByRole("radio", { name: "Positive", exact: true }).click();
  await page.getByRole("heading", { level: 1 }).focus();
  for (const name of ["tutorial-labeling", "tutorial-done"]) {
    if (name === "tutorial-done") {
      await page.getByRole("button", { name: "Next record", exact: true }).last().click();
      await page.getByRole("radio", { name: "Negative", exact: true }).click();
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("heading", { name: /nice work/i }).waitFor();
    }
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle("dark", dark),
        theme === "dark",
      );
      await page.waitForTimeout(200);
      const target =
        name === "tutorial-done" ? page.locator(".glass-card").first() : page.locator("body");
      await target.screenshot({ path: join(repo, `docs/src/assets/shots/${name}.${theme}.png`) });
    }
    process.stdout.write(`Captured ${name}\n`);
  }
} finally {
  await app.close();
}
