import { z } from "zod";
import { AppConfig } from "./schema";

/**
 * Rewrite a discriminated union from `anyOf`/`oneOf` into `if`/`then`, hoisting
 * the keys every branch shares.
 *
 * Stock output already narrows correctly *once* the discriminator is written:
 * VS Code scores each branch and a matching `const` wins. The gap is the moment
 * before it — an empty field object offers the union of every variant's keys
 * (19 of them) and a bad `type` reports "Value must be 'text'" from whichever
 * branch happened to score highest. With `if`/`then` the editor offers only the
 * shared keys until a type is chosen, then narrows, and reports the full list of
 * valid discriminator values.
 *
 * Verified equivalent to the stock form against ajv across the config surface.
 */
const narrowDiscriminatedUnions: NonNullable<Parameters<typeof z.toJSONSchema>[1]>["override"] = (
  ctx,
) => {
  const def = (ctx.zodSchema as { _zod: { def: { type: string; discriminator?: string } } })._zod
    .def;
  if (def.type !== "union" || def.discriminator === undefined) return;

  const json = ctx.jsonSchema as Record<string, unknown>;
  const branches = (json["oneOf"] ?? json["anyOf"]) as Record<string, any>[] | undefined;
  if (!branches || branches.length === 0) return;

  const tag = def.discriminator;
  const tagSchemas = branches.map((b) => b["properties"]?.[tag]);
  // An optional discriminator can't drive if/then; leave those alone.
  if (tagSchemas.some((t) => t?.const === undefined)) return;

  const shared: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(branches[0]?.["properties"] ?? {})) {
    if (name === tag) continue;
    const encoded = JSON.stringify(schema);
    if (branches.every((b) => JSON.stringify(b["properties"]?.[name]) === encoded)) {
      shared[name] = schema;
    }
  }
  const sharedRequired = Object.keys(shared).filter((name) =>
    branches.every((b) => ((b["required"] ?? []) as string[]).includes(name)),
  );

  delete json["oneOf"];
  delete json["anyOf"];
  json["type"] = "object";
  // `anyOf` over the per-branch tag schemas keeps each variant's description,
  // so the `"type": │` dropdown documents what each one means.
  json["properties"] = { [tag]: { anyOf: tagSchemas }, ...shared };
  json["required"] = [tag, ...sharedRequired];
  json["allOf"] = branches.map((branch, i) => ({
    if: { properties: { [tag]: { const: tagSchemas[i].const } }, required: [tag] },
    // `then` here is the JSON Schema keyword, not a promise callback.
    // eslint-disable-next-line unicorn/no-thenable
    then: branch,
  }));
};

/**
 * Emit a JSON Schema for the config so editors offer autocomplete and
 * validation while authoring the `.jsonc`.
 *
 * `io: "input"` gives the author-facing view, so defaulted keys aren't marked
 * required. `reused: "ref"` extracts shared shapes into `$defs` instead of
 * inlining them at every use — worth roughly a third of the file size, with the
 * human-readable names coming from `.meta({ id })` on each schema.
 */
export function buildConfigJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AppConfig, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
    reused: "ref",
    override: narrowDiscriminatedUnions,
  }) as Record<string, unknown>;
}
