import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "playwright";

/**
 * Capture the screenshots the docs embed, in both themes.
 *
 * Driven rather than hand-captured so they can be regenerated after a UI change
 * instead of slowly going stale. Requires a built app: run `pnpm build` in the
 * repo root first.
 *
 * Two things make this work without adding test hooks to the app:
 *
 * 1. **The main process is scriptable.** `electronApp.evaluate` runs inside
 *    main, so the native file dialogs and the application menu can be driven
 *    there, and the real button clicks then exercise the genuine IPC flow.
 *    Nothing is mocked in the renderer.
 * 2. **An unpackaged build discovers a config in `process.cwd()`.** Launching
 *    with the cwd set to a scratch directory holding `config.jsonc` means the
 *    app auto-loads it, exactly as a deployed one would — and launching from a
 *    directory *without* one gives the first-run screen.
 *
 * Each scenario gets its own scratch directory and its own `--user-data-dir`,
 * so a real session or recent path on the developer's machine cannot leak into
 * a capture, and scenarios cannot contaminate each other.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "../..");
const MAIN = join(REPO, "out/main/index.mjs");
const SHOTS = resolve(here, "../src/assets/shots");

/** 16:10 — big enough to read, small enough to embed. */
const VIEWPORT = { width: 1280, height: 800 };

/**
 * Fixed, and deliberately not `os.tmpdir()`.
 *
 * The app prints the config and source paths on screen, and on macOS `tmpdir()`
 * is a per-user `/var/folders/7z/h2286hz51js…` path — a machine-identifying
 * string that would be published in every screenshot.
 */
const WORKSPACE_ROOT =
  process.platform === "win32" ? join(tmpdir(), "mlabel-demo") : "/tmp/mlabel-demo";

type Theme = "light" | "dark";

async function setTheme(page: Page, theme: Theme): Promise<void> {
  // The app keys off a `.dark` class on <html>, set from the OS theme. Toggling
  // it directly is what a theme switch does, without needing to reach into a
  // bundled store or change the host machine's appearance.
  await page.evaluate((dark) => {
    document.documentElement.classList.toggle("dark", dark);
  }, theme === "dark");
  // Let the transition settle so neither capture catches a half-faded colour.
  await page.waitForTimeout(250);
}

async function capture(page: Page, name: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await setTheme(page, theme);
    await page.screenshot({ path: join(SHOTS, `${name}.${theme}.png`) });
  }
  process.stdout.write(`  ✓ ${name}\n`);
}

/** Point the native open dialog at fixed paths for subsequent calls. */
async function stubOpenDialog(app: ElectronApplication, paths: string[]): Promise<void> {
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths });
  }, paths);
}

/** Click an application-menu item by id — how mode switching is reachable. */
async function clickMenuItem(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click();
  }, id);
}

interface Workspace {
  dir: string;
  csv: string;
}

/**
 * A scratch workspace. `config` chooses which config, if any, sits beside the app.
 *
 * Deliberately a fixed, tidy path rather than `mkdtemp`: the app shows the config
 * path on its error screen, and a randomized `/var/folders/7z/h2286hz…` in a
 * published screenshot is both ugly and machine-identifying.
 */
function makeWorkspace(config: "sample" | "broken" | "none"): Workspace {
  const dir = join(WORKSPACE_ROOT, config);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const csv = join(dir, "input.sample.csv");
  cpSync(join(REPO, "examples/input.sample.csv"), csv);
  mkdirSync(join(dir, "userdata"), { recursive: true });

  if (config === "sample") {
    cpSync(join(REPO, "examples/config.jsonc"), join(dir, "config.jsonc"));
  } else if (config === "broken") {
    // Three distinct failures, so the error screen shows a realistic list
    // rather than one lonely message.
    writeFileSync(
      join(dir, "config.jsonc"),
      JSON.stringify(
        {
          version: 2,
          network: { updateCheck: false },
          input: { fields: [{ name: "prompt", type: "text" }] },
          output: {
            fields: [
              { name: "prompt", type: "integer", fill: { kind: "copy" } },
              { name: "notes", type: "text", shortcut: "mod+v" },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }
  return { dir, csv };
}

async function launch(workspace: Workspace): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [MAIN, `--user-data-dir=${join(workspace.dir, "userdata")}`],
    cwd: workspace.dir,
  });
  const page = await app.firstWindow();
  await page.setViewportSize(VIEWPORT);
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

/** Run one scenario against a fresh app, tearing everything down afterwards. */
async function scenario(
  label: string,
  config: "sample" | "broken" | "none",
  body: (app: ElectronApplication, page: Page, workspace: Workspace) => Promise<void>,
): Promise<void> {
  process.stdout.write(`${label}\n`);
  const workspace = makeWorkspace(config);
  const { app, page } = await launch(workspace);
  try {
    await body(app, page, workspace);
  } finally {
    await app.close();
    rmSync(workspace.dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });

  await scenario("First run (no config)", "none", async (_app, page) => {
    await page.getByRole("heading", { level: 1 }).waitFor();
    await capture(page, "start-need-config");
  });

  await scenario("Invalid config", "broken", async (_app, page) => {
    await page.getByRole("heading", { level: 1 }).waitFor();
    await capture(page, "config-invalid");
  });

  await scenario("Labeling", "sample", async (app, page, workspace) => {
    await page.getByRole("heading", { level: 1 }).waitFor();
    await capture(page, "start-need-input");

    await stubOpenDialog(app, [workspace.csv]);
    await page
      .getByRole("button", { name: /choose|select|open/i })
      .first()
      .click();

    // Session fields, if the config declares any, come before the record form.
    const prefill = page.getByRole("heading", { name: /before you start|setup|about this run/i });
    if (await prefill.isVisible().catch(() => false)) {
      await capture(page, "prefill");
      await page
        .getByRole("button", { name: /start|continue/i })
        .first()
        .click();
    }

    await page.getByRole("heading", { level: 1 }).waitFor();
    // This view also carries a firing display rule, so the guide's tones
    // section reuses this capture rather than shipping an identical copy.
    await capture(page, "labeling");

    // The nested value tables sit further down the input column.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);
    await capture(page, "value-table");
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(200);

    await page.keyboard.press("?");
    await page.getByRole("dialog").waitFor();
    await capture(page, "shortcuts-dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await page.getByRole("heading", { name: /done|nice work/i }).waitFor();
    await capture(page, "done");
  });

  await scenario("Resume prompt", "sample", async (app, page, workspace) => {
    await page.getByRole("heading", { level: 1 }).waitFor();
    await stubOpenDialog(app, [workspace.csv]);
    await page
      .getByRole("button", { name: /choose|select|open/i })
      .first()
      .click();
    await page.getByRole("heading", { level: 1 }).waitFor();

    // A session only counts as resumable once a saved label differs from the
    // seeded baseline, so an actual answer has to be given first.
    await page.getByRole("radio").first().click();
    await page.waitForTimeout(600);
    await app.close();

    // Relaunching the same workspace finds the session and offers to restore it.
    const second = await launch(workspace);
    try {
      await second.page.getByRole("heading", { level: 1 }).waitFor();
      await stubOpenDialog(second.app, [workspace.csv]);
      await second.page
        .getByRole("button", { name: /choose|select|open/i })
        .first()
        .click();
      await second.page.getByRole("dialog").waitFor();
      await capture(second.page, "resume-dialog");
    } finally {
      await second.app.close();
    }
  });

  await scenario("Prepare — join", "sample", async (app, page, workspace) => {
    // Two labeled part files, as they would come back from two labelers.
    const golden = readFileSync(join(REPO, "examples/output.golden.csv"), "utf8");
    const parts = ["input.sample-part1-of-2-output.csv", "input.sample-part2-of-2-output.csv"].map(
      (name) => {
        const path = join(workspace.dir, name);
        writeFileSync(path, golden, "utf8");
        return path;
      },
    );

    await page.getByRole("heading", { level: 1 }).waitFor();
    await clickMenuItem(app, "mode-prepare");
    await page.getByRole("heading", { name: /prepare data/i }).waitFor();

    await stubOpenDialog(app, parts);
    await page
      .getByRole("button", { name: /choose|select|browse|open/i })
      .first()
      .click();
    await page.waitForTimeout(600);

    const proceed = page.getByRole("button", { name: /join|continue|yes/i }).first();
    if (await proceed.isVisible().catch(() => false)) {
      await proceed.click();
      await page.waitForTimeout(500);
    }
    await capture(page, "prepare-join");
  });

  await scenario("Prepare — split", "sample", async (app, page, workspace) => {
    await page.getByRole("heading", { level: 1 }).waitFor();
    await clickMenuItem(app, "mode-prepare");
    await page.getByRole("heading", { name: /prepare data/i }).waitFor();
    await capture(page, "prepare-idle");

    // Dropping is the real entry point, but the picker reaches the same stages
    // and is scriptable; the confirm gate is identical either way.
    await stubOpenDialog(app, [workspace.csv]);
    const pick = page.getByRole("button", { name: /choose|select|browse|open/i }).first();
    if (await pick.isVisible().catch(() => false)) {
      await pick.click();
      await page.waitForTimeout(500);
      await capture(page, "prepare-confirm");

      const proceed = page.getByRole("button", { name: /split|continue|yes/i }).first();
      if (await proceed.isVisible().catch(() => false)) {
        await proceed.click();
        await page.waitForTimeout(400);
        await capture(page, "prepare-split");
      }
    }
  });

  rmSync(WORKSPACE_ROOT, { recursive: true, force: true });
  process.stdout.write(`\nWrote screenshots to ${SHOTS}\n`);
}

await main();
