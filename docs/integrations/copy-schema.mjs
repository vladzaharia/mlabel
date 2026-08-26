import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../../schema/mlabel.schema.json");
const TARGET = resolve(here, "../public/mlabel.schema.json");

/**
 * Publish the config JSON Schema at `/mlabel.schema.json`.
 *
 * A standalone config points its `$schema` at that URL, so the file has to be
 * served from the docs origin. Copying at build time rather than committing a
 * duplicate keeps `schema/mlabel.schema.json` the only copy anyone edits — a
 * checked-in second copy would drift, and the drift would be invisible until
 * someone's editor started disagreeing with the app.
 */
export function copySchema() {
  return {
    name: "mlabel:copy-schema",
    hooks: {
      "astro:config:setup": () => {
        mkdirSync(dirname(TARGET), { recursive: true });
        copyFileSync(SOURCE, TARGET);
      },
    },
  };
}
