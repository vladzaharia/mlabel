import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildConfigJsonSchema } from "./json-schema";

describe("buildConfigJsonSchema", () => {
  it("emits a JSON Schema object without throwing on the recursive ValueType", () => {
    const schema = buildConfigJsonSchema();
    expect(schema).toBeTypeOf("object");
    // Recursion is extracted into $defs/$ref by Zod's toJSONSchema.
    expect(JSON.stringify(schema)).toMatch(/\$ref|\$defs|properties/);
  });

  it("describes the top-level config shape", () => {
    const schema = buildConfigJsonSchema() as { properties?: Record<string, unknown> };
    expect(schema.properties).toBeDefined();
    expect(schema.properties).toHaveProperty("input");
    expect(schema.properties).toHaveProperty("output");
  });

  // Editors validate configs against the checked-in file, so drift means authors
  // get squiggles on correct configs and silence on wrong ones. `pnpm schema` is
  // a manual step; this is what notices when someone forgets it.
  it("matches the checked-in schema/mlabel.schema.json — run `pnpm schema` if this fails", () => {
    const published: unknown = JSON.parse(
      readFileSync(resolve("schema/mlabel.schema.json"), "utf8"),
    );
    // Compared as parsed JSON, not bytes: oxfmt reformats the file after emission.
    expect(published).toEqual(buildConfigJsonSchema());
  });

  it("forbids unknown keys, so a typo is an editor squiggle and not a silent drop", () => {
    const json = JSON.stringify(buildConfigJsonSchema());
    expect(json).toContain('"additionalProperties":false');
  });
});
