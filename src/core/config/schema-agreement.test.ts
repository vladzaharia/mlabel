import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseJsonc } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import { buildConfigJsonSchema } from "./json-schema";
import { loadConfig } from "./loader";

/**
 * The published JSON Schema must never reject a config the app accepts.
 *
 * The docs tell authors to point `$schema` at the published file and trust the
 * squiggles. A schema that is *stricter* than the app is therefore the damaging
 * failure: it marks correct configs as broken, and an author who believes it
 * changes working config into something worse.
 *
 * The reverse gap is expected and fine. JSON Schema cannot express the
 * cross-field checks — dangling references, copy type mismatches, shortcut
 * collisions — so the schema accepts some configs `loadConfig` rejects. It is a
 * first-pass editing aid, not a second implementation of the validator.
 *
 * This caught a real bug: `"display": "Some title"` is expanded by the loader
 * *before* Zod runs, so the emitted schema knew only the object form and
 * rejected the project's own example config six times over.
 */

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validate = ajv.compile(buildConfigJsonSchema());

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return markdownFiles(full);
    return /\.mdx?$/.test(entry) ? [full] : [];
  });
}

/** Every config in the repo that is meant to load: the example, plus the docs. */
function acceptedConfigs(): { label: string; text: string }[] {
  const out = [
    { label: "examples/config.jsonc", text: readFileSync("examples/config.jsonc", "utf8") },
  ];
  for (const file of markdownFiles("docs/src/content/docs")) {
    readFileSync(file, "utf8")
      .split("```jsonc")
      .slice(1)
      .forEach((block, index) => {
        const text = (block.split("```")[0] ?? "").trim();
        // Whole configs only; `…` marks a deliberately elided fragment.
        if (!text.startsWith("{") || !text.includes('"version"') || text.includes("…")) return;
        out.push({ label: `${file} (block ${String(index + 1)})`, text });
      });
  }
  return out.filter((entry) => loadConfig(entry.text).ok);
}

describe("the published JSON Schema agrees with the loader", () => {
  const configs = acceptedConfigs();

  it("finds configs to check, so a broken extractor can't pass vacuously", () => {
    expect(configs.length).toBeGreaterThan(1);
  });

  it.each(configs.map((c) => [c.label, c.text] as const))(
    "accepts %s, which the app accepts",
    (_label, text) => {
      const valid = validate(parseJsonc(text));
      const errors = (validate.errors ?? [])
        .map((e) => `  ${e.instancePath || "/"} ${e.message ?? ""}`)
        .join("\n");
      expect(valid, `\nSchema rejected a config the app accepts:\n${errors}\n`).toBe(true);
    },
  );

  // The shorthand is the case that regressed before, and the one authors write
  // most, so it gets an explicit test rather than relying on the corpus.
  it("accepts the bare-string `display` shorthand the loader expands", () => {
    const config = {
      version: 2,
      input: { fields: [{ name: "text", type: "text", display: "Some title" }] },
      output: { fields: [{ name: "label", type: "text", display: "Your label" }] },
    };
    expect(loadConfig(JSON.stringify(config)).ok).toBe(true);
    expect(validate(config)).toBe(true);
  });
});
