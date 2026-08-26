import { readFileSync } from "node:fs";
import { loadConfig, type ConfigIssue } from "../src/core/config/loader";

/**
 * Check an MLabel config without launching the app.
 *
 *     pnpm validate examples/config.jsonc
 *
 * Exists mostly for authors who cannot see the GUI — CI, and the agents the
 * docs site instructs. It calls the same `loadConfig` the app calls, so a
 * config this accepts is one the app accepts; there is no second opinion to
 * drift out of sync.
 */

/** Every problem with `text`, or an empty list when it is a valid config. */
export function validateConfigText(text: string): ConfigIssue[] {
  const result = loadConfig(text);
  return result.ok ? [] : result.issues;
}

/**
 * Render issues the way editors and terminals expect: `file:line:col — message`.
 *
 * The location is omitted rather than faked when the loader could not place the
 * node — cross-field checks can name a path that has no source node, and
 * `cfg.jsonc:undefined:undefined` is worse than no numbers at all.
 */
export function formatIssues(file: string, issues: readonly ConfigIssue[]): string {
  return issues
    .map((issue) => {
      const where =
        issue.line === undefined ? file : `${file}:${String(issue.line)}:${String(issue.column)}`;
      const path = issue.path === undefined ? "" : ` (${issue.path})`;
      return `${where}${path} — ${issue.message}`;
    })
    .join("\n");
}

function main(argv: readonly string[]): number {
  const file = argv[0];
  if (file === undefined) {
    process.stderr.write("Usage: pnpm validate <config.jsonc>\n");
    return 2;
  }

  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`Could not read ${file}\n`);
    return 2;
  }

  const issues = validateConfigText(text);
  if (issues.length === 0) {
    process.stdout.write(`${file} is a valid MLabel config.\n`);
    return 0;
  }

  process.stderr.write(`${formatIssues(file, issues)}\n`);
  const count = issues.length;
  process.stderr.write(`\n${String(count)} problem${count === 1 ? "" : "s"} found.\n`);
  return 1;
}

// Only run when invoked as a script, so the tests can import the helpers above.
if (process.argv[1]?.endsWith("validate-config.ts")) {
  process.exitCode = main(process.argv.slice(2));
}
