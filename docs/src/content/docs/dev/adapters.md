---
title: Writing an adapter
description: Adding a data format — the two interfaces, the provenance token, and the rules that keep format detail out of the core.
sidebar:
  order: 6
---

Adding a format must require **no changes** to `src/core/` beyond registering it, and none
at all to the renderer or the config schema. If your change touches either, the abstraction
has leaked.

## The two interfaces

```ts
interface SourceAdapter {
  readonly manifest: AdapterManifest;
  parse(
    input: AdapterInput,
    expectedFields: readonly string[],
    adapterConfig?: unknown,
  ): ParseResult;
  reemit(records: readonly RawRecord[]): string;
}

interface SinkAdapter {
  readonly manifest: AdapterManifest;
  serialize(
    records: readonly LabeledRecord[],
    columns: readonly OutputColumn[],
    adapterConfig?: unknown,
  ): string;
}
```

A manifest is an id, a label, and the lowercase extensions the adapter handles. Extension
matching wins over the config's `adapterId`, so opening a `.tsv` uses the CSV adapter
whatever the config says.

## `AdapterInput`

```ts
type AdapterInput =
  | { kind: "content"; name: string; text: string }
  | { kind: "params"; name?: string; params: unknown };
```

Main reads bytes and hands over text — that is what keeps Node's file system out of the
core. `params` exists for sources that are not files (a database query, say); a
content-only adapter should throw on it, as the CSV adapter does.

## The provenance token

This is the piece that makes the whole thing work.

```ts
interface ProvenanceToken<T = unknown> {
  readonly __adapter: string;
  readonly __raw: T;
}
```

Each `RawRecord` your `parse` produces carries one. `T` is known **only inside your
adapter**. The core, the renderer and the config schema never look inside it.

That is how unfinished rows get re-emitted in their original shape without anything outside
the adapter knowing what a delimiter is. The CSV adapter stores the original cells plus the
document's header cells, delimiter and newline; `reemit` decodes them back.

:::caution[Internals are enforced, not requested]
Put format-specific types under `src/core/adapters/<id>/internal/`. An oxlint
`no-restricted-imports` rule fails the build if anything outside your adapter folder imports
them. This is deliberately not left to discipline.
:::

## Issues

`parse` returns issues alongside the document. Severity decides the consequence:

| Kind        | Severity  | Meaning                                           |
| ----------- | --------- | ------------------------------------------------- |
| `missing`   | **error** | A declared column is absent — the file is refused |
| `extra`     | warning   | A column not in the schema, ignored               |
| `duplicate` | warning   | A repeated column name                            |
| `coercion`  | warning   | A cell that will not parse                        |
| `schema`    | either    | Anything else format-specific                     |

Any `severity: "error"` refuses the file. Be sparing: a labeler cannot fix the source data,
so prefer a warning attached to the cell over rejecting the whole file.

## Steps

1. **Create `src/core/adapters/<id>/`** with `index.ts`, `source.ts`, `sink.ts` and an
   `internal/` folder.
2. **Define your provenance shape** in `internal/`, plus a `makeProvenance` / `readProvenance`
   pair. Nothing outside imports these.
3. **Implement `parse`** — validate headers against `expectedFields`, build `RawRecord`s,
   stamp each with provenance. Do not coerce; the core does that from the declared type.
4. **Implement `reemit`** — records back to your format, in the original dialect.
5. **Implement `serialize`** — complete records to your format, columns in the given order.
6. **Register it** in `src/core/adapters/index.ts`:

   ```ts
   export function createDefaultRegistry(): AdapterRegistry {
     return new AdapterRegistry()
       .registerSource(csvSourceAdapter)
       .registerSink(csvSinkAdapter)
       .registerSource(myAdapter)
       .registerSink(mySink);
   }
   ```

That is the only file in `src/core/` you touch.

## The round-trip property test

The contract `reemit` must satisfy is **value fidelity**, not byte fidelity: values, column
order and dialect survive; incidental formatting need not.

Pin it with a property test, as `csv.test.ts` does — generate arbitrary documents, parse,
re-emit, parse again, and assert the two parses agree:

```ts
fc.assert(
  fc.property(arbitraryDocument(), (doc) => {
    const once = adapter.parse({ kind: "content", name: "t", text: render(doc) }, expected);
    const twice = adapter.parse(
      { kind: "content", name: "t", text: adapter.reemit(once.document.records) },
      expected,
    );
    expect(twice.document.records.map((r) => r.fields)).toEqual(
      once.document.records.map((r) => r.fields),
    );
  }),
);
```

This is the test that matters. Prepare's join flow depends on `*-remaining` reloading
cleanly, and a round-trip bug there is silent data loss.

## What you do not implement

- **Coercion.** The core does it from the declared type. Hand back raw primitives.
- **Validation of values.** Also the core's job. You validate _structure_ — headers, shape.
- **Anything about widgets, cards or rules.** Those never reach an adapter.

## Checklist

- [ ] Nothing outside your folder imports `internal/`.
- [ ] No Electron and no `node:fs` import — main hands you text.
- [ ] `parse` never throws on bad data; it reports issues.
- [ ] Only a genuinely unusable file produces `severity: "error"`.
- [ ] The round-trip property test passes.
- [ ] `pnpm test` and `pnpm lint` are green — the import fence is a lint rule.
