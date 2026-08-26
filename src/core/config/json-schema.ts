import { z } from "zod";
import { AppConfig } from "./schema";

type JsonNode = Record<string, any>;

/**
 * Temporary marker recording which key a union discriminates on.
 *
 * The rewrite below needs two things that never exist at the same moment: the
 * Zod-level knowledge of *which* key is the discriminator (available only in
 * `override`, per node, mid-conversion) and a resolvable `$defs` map (only once
 * conversion has finished). So `override` marks, and the post-pass rewrites and
 * strips the marks. Detecting discriminated-ness structurally afterwards would
 * work but would guess at a fact Zod already knows.
 */
const DISCRIMINATOR = "x-mlabel-discriminator";

const markDiscriminatedUnions: NonNullable<Parameters<typeof z.toJSONSchema>[1]>["override"] = (
  ctx,
) => {
  const def = (ctx.zodSchema as { _zod: { def: { type: string; discriminator?: string } } })._zod
    .def;
  if (def.type === "union" && def.discriminator !== undefined) {
    (ctx.jsonSchema as JsonNode)[DISCRIMINATOR] = def.discriminator;
  }
};

/** Every object node in the document, `$defs` included, depth-first. */
function* walk(node: unknown): Generator<JsonNode> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
    return;
  }
  if (node === null || typeof node !== "object") return;
  yield node as JsonNode;
  for (const value of Object.values(node)) yield* walk(value);
}

/**
 * Rewrite every discriminated union from `oneOf` into `if`/`then`, hoisting the
 * keys each branch shares.
 *
 * Stock output already narrows correctly *once* the discriminator is written:
 * VS Code scores each branch and a matching `const` wins. The gap is the moment
 * before it — an empty field object offers the union of every variant's keys
 * (19 of them) and a bad `type` reports "Value must be 'text'" from whichever
 * branch happened to score highest. With `if`/`then` the editor offers only the
 * shared keys until a type is chosen, then narrows, and reports the full list of
 * valid discriminator values.
 *
 * Branches must be resolved through `$ref` before their `properties` can be
 * read: `reused: "ref"` hoists each variant into `$defs`, so a branch arrives
 * here as a bare `{ "$ref": … }`. Reading `properties` off that gives
 * `undefined`, which is what previously made this bail on every field union and
 * fire only for `Fill` — the one union whose branches stayed inline.
 *
 * `then` keeps the `$ref` rather than inlining the resolved branch: editors
 * follow it, and inlining nine variants four times over would double the file.
 *
 * Re-verified against ajv after this was fixed to fire on the field unions:
 * across the repo's configs and a set of deliberate mutations, the rewritten
 * form and the stock `oneOf` form return identical verdicts. `if`/`then` over
 * distinct `const` tags is equivalent to `oneOf` — exactly one `if` can match —
 * and the hoisted keys constrain nothing extra, since they are identical in
 * every branch by construction. `schema-agreement.test.ts` keeps the property
 * that matters under test.
 */
function narrowDiscriminatedUnions(root: JsonNode): void {
  const defs = (root["$defs"] ?? {}) as JsonNode;
  const resolve = (node: JsonNode | undefined): JsonNode | undefined => {
    const ref = node?.["$ref"];
    return typeof ref === "string" ? (defs[ref.split("/").pop() as string] as JsonNode) : node;
  };

  // Snapshot before mutating. `walk` is lazy and reads each node's values after
  // yielding it, so rewriting a node in the loop body would send the traversal
  // into the `allOf`/`properties` structures this very pass just built.
  // eslint-disable-next-line unicorn/no-useless-spread
  const nodes = [...walk(root)];

  for (const json of nodes) {
    const tag = json[DISCRIMINATOR];
    if (typeof tag !== "string") continue;
    delete json[DISCRIMINATOR];

    const branches = (json["oneOf"] ?? json["anyOf"]) as JsonNode[] | undefined;
    if (!branches || branches.length === 0) continue;

    const resolved = branches.map((branch) => resolve(branch));
    const tagSchemas = resolved.map((branch) => resolve(branch?.["properties"]?.[tag]));
    // An optional discriminator can't drive if/then; leave those alone.
    if (tagSchemas.some((t) => t?.["const"] === undefined)) continue;

    const shared: Record<string, unknown> = {};
    for (const [name, schema] of Object.entries(resolved[0]?.["properties"] ?? {})) {
      if (name === tag) continue;
      const encoded = JSON.stringify(schema);
      if (resolved.every((b) => JSON.stringify(b?.["properties"]?.[name]) === encoded)) {
        shared[name] = schema;
      }
    }
    const sharedRequired = Object.keys(shared).filter((name) =>
      resolved.every((b) => ((b?.["required"] ?? []) as string[]).includes(name)),
    );

    delete json["oneOf"];
    delete json["anyOf"];
    json["type"] = "object";
    // `anyOf` over the per-branch tag schemas keeps each variant's description,
    // so the `"type": │` dropdown documents what each one means. The synthesized
    // node carries prose of its own too — without it, hovering the discriminator
    // itself (the key an author is most likely to be unsure about) says nothing.
    json["properties"] = {
      [tag]: {
        description: `Selects which shape the rest of this object takes. Every other key is validated against the variant named here.`,
        anyOf: tagSchemas,
      },
      ...shared,
    };
    json["required"] = [tag, ...sharedRequired];
    json["allOf"] = branches.map((branch, i) => ({
      if: { properties: { [tag]: { const: tagSchemas[i]!["const"] } }, required: [tag] },
      // `then` here is the JSON Schema keyword, not a promise callback.
      // eslint-disable-next-line unicorn/no-thenable
      then: branch,
    }));
  }
}

/**
 * Widen every `display` to also accept the bare-string shorthand.
 *
 * `"display": "Model score"` is expanded to `{ title: … }` by
 * `normalizeDisplayShorthand` in the loader, *before* Zod ever sees it — which
 * is deliberate (see `value-type.ts`: a Zod `.transform()` would make the
 * schema's input and output types differ, and the recursive `z.ZodType<S, S>`
 * annotations can't express that). The consequence is that the Zod schema
 * describes only the post-normalization shape.
 *
 * This artifact is the *author-facing* view — it is emitted with `io: "input"`
 * — and authors overwhelmingly write the shorthand. Without this pass the
 * published schema rejects the project's own example config six times over, so
 * following the docs would produce red squiggles on correct configs: precisely
 * the failure `$schema` is meant to prevent.
 *
 * Widening here rather than in Zod keeps the runtime types single-shaped. The
 * app still only ever sees the object form.
 */
function acceptDisplayShorthand(root: JsonNode): void {
  const SHORTHAND = {
    type: "string",
    description: 'Shorthand for `{ "title": … }`, which is how most display blocks are written.',
  };

  for (const node of walk(root)) {
    const properties = node["properties"] as JsonNode | undefined;
    const display = properties?.["display"] as JsonNode | undefined;
    if (!display) continue;
    // `walk` visits the widened node's own children, so skip what we just built.
    if (Array.isArray(display["anyOf"])) continue;
    properties!["display"] = { anyOf: [SHORTHAND, display] };
  }
}

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
  const schema = z.toJSONSchema(AppConfig, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
    reused: "ref",
    override: markDiscriminatedUnions,
  }) as JsonNode;
  // Order matters: narrowing hoists shared keys (including `display`) out of
  // the branches, so widening afterwards catches both the hoisted copy and the
  // per-variant ones.
  narrowDiscriminatedUnions(schema);
  acceptDisplayShorthand(schema);
  return schema;
}
