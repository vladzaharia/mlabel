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
});
