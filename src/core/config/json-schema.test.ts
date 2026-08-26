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

type JsonObject = Record<string, any>;

const defs = (): JsonObject => (buildConfigJsonSchema() as JsonObject)["$defs"] as JsonObject;

/**
 * Follow a `$ref` chain into `$defs` to the node carrying the actual shape.
 *
 * A chain rather than a single hop: an optional wrapper is extracted as its own
 * `$def` that only points at the real one, so one hop lands on a bare `$ref`.
 */
function deref(node: JsonObject | undefined, all: JsonObject): JsonObject | undefined {
  let current = node;
  for (let hops = 0; current && hops < 20; hops++) {
    const ref = current["$ref"];
    if (typeof ref !== "string") return current;
    current = all[ref.split("/").pop() as string] as JsonObject;
  }
  return current;
}

/**
 * The nearest description along a `$ref` chain.
 *
 * Draft 2020-12 allows `$ref` to carry siblings, and Zod uses that: a key's
 * prose often sits *beside* the reference rather than in its target. Following
 * the chain to the end would hop straight past it, so this stops at the first
 * node that has one — which is also how an editor resolves the hover text.
 */
function describeNode(node: JsonObject | undefined, all: JsonObject): string | undefined {
  let current = node;
  for (let hops = 0; current && hops < 20; hops++) {
    if (typeof current["description"] === "string") return current["description"];
    const ref = current["$ref"];
    if (typeof ref !== "string") return undefined;
    current = all[ref.split("/").pop() as string] as JsonObject;
  }
  return undefined;
}

describe("$defs naming", () => {
  /**
   * Every concept the docs give a page to carries a `.meta({ id })`, so
   * `reused: "ref"` extracts it under a stable, human-readable key.
   *
   * The generated reference pages are keyed off these names. An anonymous
   * `__schemaN` is positional — inserting one field upstream renumbers
   * everything after it, silently repointing every generated URL. Per-variant
   * branch schemas are deliberately *not* in this list: they render inside
   * their parent's page, so they never appear in a URL.
   */
  const NAMED = [
    "InputField",
    "OutputField",
    "ValueType",
    "NestedField",
    "Condition",
    "DisplayRule",
    "Fill",
    "Card",
    "CardRow",
    "Choice",
    "Style",
    "TextDisplay",
    "FieldDisplay",
    "TableColumn",
    "TableView",
  ];

  it.each(NAMED)("extracts %s under its own name", (name) => {
    expect(Object.keys(defs())).toContain(name);
  });
});

describe("discriminated unions narrow for editors", () => {
  // The whole point of the if/then rewrite: before a `type` is written the
  // editor offers only the shared keys, and a bad `type` reports the full list
  // of valid values rather than whichever branch happened to score highest.
  const UNIONS = ["InputField", "OutputField", "ValueType", "NestedField", "Fill", "Condition"];

  it.each(UNIONS)("rewrites %s into if/then rather than a bare oneOf", (name) => {
    const def = defs()[name] as JsonObject;
    expect(def["oneOf"]).toBeUndefined();
    expect(def["anyOf"]).toBeUndefined();
    expect(Array.isArray(def["allOf"])).toBe(true);
    expect((def["allOf"] as JsonObject[])[0]).toHaveProperty("if");
  });

  it("offers every value type as a documented discriminator option", () => {
    const all = defs();
    const type = (all["InputField"] as JsonObject)["properties"]["type"] as JsonObject;
    const consts = (type["anyOf"] as JsonObject[]).map((branch) => branch["const"]);
    expect(consts).toEqual([
      "text",
      "integer",
      "number",
      "boolean",
      "date",
      "enum",
      "object",
      "array",
      "map",
    ]);
    // Each variant keeps its own prose, so the `"type": │` dropdown explains
    // what each option means instead of listing nine bare strings.
    for (const branch of type["anyOf"] as JsonObject[]) {
      expect(branch["description"]).toBeTypeOf("string");
    }
  });

  it("hoists the keys every variant shares, so an empty field object is not a 19-key soup", () => {
    const def = defs()["InputField"] as JsonObject;
    expect(Object.keys(def["properties"] as JsonObject)).toEqual(["type", "name", "display"]);
    expect(def["required"]).toEqual(["type", "name"]);
  });
});

describe("the string shorthand for `display`", () => {
  /**
   * `"display": "Model score"` is expanded to `{ title: … }` by the loader,
   * *before* Zod sees it — so the schema Zod describes knows only the object
   * form. The emitted JSON Schema is the author-facing view (`io: "input"`),
   * and authors overwhelmingly write the shorthand, so it has to accept both.
   *
   * Without this the published schema rejects the project's own example config
   * six times over, and every author who follows the docs gets red squiggles on
   * correct configs — the exact failure mode `$schema` exists to prevent.
   */
  function displayNode(owner: string): JsonObject {
    const all = defs();
    const def = all[owner] as JsonObject;
    const branch = deref(def["allOf"][0]["then"], all) as JsonObject;
    return branch["properties"]["display"] as JsonObject;
  }

  it.each(["InputField", "OutputField", "NestedField"])("is accepted on %s", (owner) => {
    const options = displayNode(owner)["anyOf"] as JsonObject[];
    expect(options).toBeDefined();
    expect(options.some((option) => option["type"] === "string")).toBe(true);
  });

  it("is accepted on the shapes that take a plain text display", () => {
    const all = defs();
    for (const owner of ["Choice", "Card", "TableColumn"]) {
      const node = (all[owner] as JsonObject)["properties"]["display"] as JsonObject;
      const options = node["anyOf"] as JsonObject[];
      expect(options, `${owner}.display offers no shorthand`).toBeDefined();
      expect(options.some((option) => option["type"] === "string")).toBe(true);
    }
  });

  it("still offers the object form, so `title` and `help` keep autocompleting", () => {
    const options = displayNode("InputField")["anyOf"] as JsonObject[];
    const object = options.find((option) => option["type"] !== "string");
    expect(deref(object, defs())?.["properties"]).toHaveProperty("title");
  });
});

describe("prose reaches the emitted schema", () => {
  // Descriptions are what an editor shows on hover and what the docs site
  // renders. JSDoc in the Zod source reaches neither.
  // Descriptions sit on the `$def`, not the use site — every consumer that
  // matters (an editor hovering a key, the reference generator) follows the ref.
  it("describes every top-level key", () => {
    const schema = buildConfigJsonSchema() as JsonObject;
    const all = schema["$defs"] as JsonObject;
    for (const key of ["version", "ui", "network", "input", "output"]) {
      const prose = describeNode(schema["properties"][key] as JsonObject, all);
      expect(prose, `${key} has no description`).toBeTypeOf("string");
    }
  });

  it("describes the constraints that are easy to misread", () => {
    const all = defs();
    const text = deref((all["InputField"] as JsonObject)["allOf"][0]["then"], all) as JsonObject;
    expect(text["properties"]["pattern"]["description"]).toBeTypeOf("string");

    // `step` is a widget hint, never a validity constraint — three slider
    // clicks legitimately produce 0.30000000000000004. Worth saying on hover.
    const integer = deref((all["InputField"] as JsonObject)["allOf"][1]["then"], all) as JsonObject;
    expect(integer["properties"]["step"]["description"]).toMatch(/hint/i);

    const copy = deref((all["Fill"] as JsonObject)["allOf"][1]["then"], all) as JsonObject;
    expect(copy["properties"]["from"]["description"]).toBeTypeOf("string");
  });
});
