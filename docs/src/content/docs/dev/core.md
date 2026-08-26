---
title: The core
description: Module map of src/core — schema, coercion, fill resolution, completion, conditions and decorations.
sidebar:
  order: 2
---

`src/core/` is pure logic. No Electron, no Node file system, no DOM. Everything here is
directly unit-testable, and it is where the TDD rule bites hardest.

## Module map

| Module                  | Owns                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| `config/schema.ts`      | The Zod `AppConfig` and every cross-field check.                   |
| `config/value-type.ts`  | The nine type variants, widgets-by-type, display and style shapes. |
| `config/loader.ts`      | JSONC parse → version gate → Zod, with line/column on every issue. |
| `config/json-schema.ts` | Emitting the editor-facing JSON Schema.                            |
| `coercion.ts`           | Raw value → typed `CoercedValue`, per declared type.               |
| `automapping.ts`        | Fill semantics: who fills, what is required, which widget.         |
| `labels.ts`             | Merging per-record, session and timestamp values.                  |
| `completion.ts`         | Validating a value, and deciding a record's status.                |
| `conditions.ts`         | Evaluating a `Condition` over a record.                            |
| `decorations.ts`        | Turning display rules into presentation intent.                    |
| `session.ts`            | Reviving a persisted session; fingerprint comparison.              |
| `prepare.ts`            | Chunking, header matching, duplicate detection, join validation.   |
| `shortcuts.ts`          | Chord parsing, matching, formatting; the reserved list.            |
| `adapters/`             | Adapter interfaces, the registry, and the CSV adapter.             |

## `typeVariants` is the keystone

`config/value-type.ts` generates all nine type variants once, for every position a type can
appear — input field, output field, `array.items`, `map.values`, nested object member:

```ts
export function typeVariants<S extends z.ZodRawShape>(shared: S, perKind: PerKind = () => ({}));
```

`shared` adds keys common to that position (`name`, `display`, and on the output side `fill`,
`required`, `shortcut`). `perKind` adds keys whose _shape_ depends on the variant — the
output side uses it to give each type only the widgets legal for it.

That is what makes `widget: "slider"` on a text field a **structural** error, visible in an
editor as you type, rather than something a hand-written check has to catch.

:::caution[Recursion needs the two-parameter annotation]
`ValueType` and `NestedField` are recursive, which needs an explicit `z.ZodType<S, S>`. The
one-parameter form silently degrades `z.input<>` to `unknown`. This is also why display
shorthand is normalized in the **loader** rather than by a Zod `.transform()` — a transform
would make input and output types differ, which `z.ZodType<S, S>` cannot express.
:::

## The completeness chain

Four modules cooperate, and the ordering matters:

```
automapping.fillKind / isRequired   who provides it, is it required
        │
labels.resolveLabelValues           merge per-record + session values
        │
completion.validateOutputValue      is this one value legal for its type
        │
completion.evaluateRecord           unlabeled | partial | complete
```

`resolveLabelValues` exists so that **one** function owns "what will actually be written".
The progress bar, the label form and the export split all call through it, so they cannot
disagree about whether a record is finished.

`evaluateRecord` switches on the **type**, sharing a discriminant with `coerceValue`. It
used to switch on the widget, which meant presentation-only variants (`number`/`slider`,
`text`/`textarea`) had to be kept in sync by hand and composite values could not be
validated at all.

## Conditions and decorations are deliberately separate

`conditions.ts` evaluates a predicate. `decorations.ts` turns a firing rule into a tone and
a note.

The split is the guarantee that display rules cannot affect output: **nothing on the export
path imports `decorations.ts`**. A future feature needing a condition — conditional
required-ness, show/hide — reuses `conditions.ts` without reaching into presentation.

`evaluateCondition` never throws. A rule pointed at a missing or wrongly-typed value simply
does not fire, because a malformed rule should leave the data looking ordinary rather than
break the screen someone is reading.

## Coercion

`coerceValue(type, raw)` maps a raw primitive to a `CoercedValue`, driven by the declared
type. It knows nothing about CSV — only about raw primitives — which is what lets a future
adapter hand it already-parsed JSON.

Empty becomes `null` for every type. Composite types accept a JSON string at the top level
and parse it before recursing.

## Barrel exports

`src/core/index.ts` is the renderer-safe surface. Adapters are **deliberately not**
re-exported: they pull in Node-only dependencies. The main process imports them from
`@core/adapters` explicitly, and an oxlint rule stops the renderer doing the same.

## Testing

TDD is the rule for everything here: red, green, refactor. Tests are co-located `*.test.ts`
and run in the `node` Vitest project. Property tests use `fast-check` — the CSV round-trip
is the notable one. See [Testing](/dev/testing/).
