import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatIssues, validateConfigText } from "./validate-config";

/**
 * Every complete config example in the docs must actually load.
 *
 * Documentation examples rot silently: nobody runs the config in a code fence,
 * so a schema change leaves the site confidently telling people to write
 * something the app now rejects. This runs them through the same `loadConfig`
 * the app uses.
 *
 * Fragments are skipped, not failed. A page that shows one field in isolation,
 * or elides the rest with `…`, is doing the right thing — only blocks that
 * claim to be whole configs are held to that standard.
 */

const DOCS = "docs/src/content/docs";

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdownFiles(full);
    return /\.mdx?$/.test(entry) ? [full] : [];
  });
}

interface Example {
  file: string;
  index: number;
  source: string;
}

/** Every ```jsonc fence in the docs that presents itself as a whole config. */
function completeExamples(): Example[] {
  const out: Example[] = [];
  for (const file of markdownFiles(DOCS)) {
    const blocks = readFileSync(file, "utf8").split("```jsonc").slice(1);
    blocks.forEach((block, index) => {
      const source = (block.split("```")[0] ?? "").trim();
      // A whole config starts at the root and declares a version. An ellipsis
      // anywhere means the author deliberately left something out.
      if (!source.startsWith("{")) return;
      if (!source.includes('"version"')) return;
      if (source.includes("…")) return;
      out.push({ file, index: index + 1, source });
    });
  }
  return out;
}

describe("docs config examples", () => {
  const examples = completeExamples();

  it("finds examples to check, so a broken extractor can't pass vacuously", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples.map((e) => [`${e.file} (block ${String(e.index)})`, e] as const))(
    "%s loads",
    (_label, example) => {
      const issues = validateConfigText(example.source);
      expect(issues.length, `\n${formatIssues(example.file, issues)}\n`).toBe(0);
    },
  );
});
