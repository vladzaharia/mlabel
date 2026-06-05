import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildConfigJsonSchema } from "../src/core/config/json-schema";

const outPath = resolve("schema/mlabel.schema.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(buildConfigJsonSchema(), null, 2) + "\n", "utf8");
// eslint-disable-next-line no-console
console.log(`Wrote ${outPath}`);
