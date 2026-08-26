---
title: Adapters
description: adapterId and adapterConfig, the CSV adapter's options, and what the re-emit contract guarantees.
---

An adapter is what turns a file format into records and back. `csv` is the only one built
in, and it is the default — most configs never mention adapters at all.

```jsonc
"input":  { "adapterId": "csv", "fields": [ /* … */ ] },
"output": { "adapterId": "csv", "fields": [ /* … */ ] },
```

## `adapterId`

Which adapter handles that side. Defaults to `"csv"`.

The CSV adapter reads `.csv` **and `.tsv`**, and writes `.csv`. Selection is by file
extension first, falling back to `adapterId` — so opening a `.tsv` uses the CSV adapter with
tab detection whatever the config says.

## `adapterConfig`

Opaque options, owned by the adapter. **This is the one object in the config where unknown
keys are allowed**, because MLabel's core never inspects it and so has no basis for judging
what belongs there.

The CSV adapter's options differ by side:

| Side       | Key         | Default | Effect                                                |
| ---------- | ----------- | ------- | ----------------------------------------------------- |
| **input**  | `delimiter` | `,`     | Field separator. Auto-detected if the file disagrees. |
| **input**  | `quoteChar` | `"`     | Quote character.                                      |
| **output** | `delimiter` | `,`     | Field separator to write.                             |
| **output** | `newline`   | `\n`    | Line ending to write.                                 |

```jsonc
"input": {
  "adapterConfig": { "delimiter": ";" },
  "fields": [ /* … */ ],
},
"output": {
  "adapterConfig": { "delimiter": ";", "newline": "\r\n" },
  "fields": [ /* … */ ],
},
```

:::caution[The two sides are not symmetric]
Input takes `quoteChar` but not `newline`; output takes `newline` but not `quoteChar`.
Because `adapterConfig` accepts unknown keys, a `newline` on the input side is **silently
ignored** rather than reported. This is the one place in the config where a typo does not
tell you about itself.
:::

Input line endings are detected from the file, which is why input has no `newline` option.
Output quoting is applied wherever a value needs it, which is why output has no `quoteChar`.

## What happens on read

1. The file is read, and a byte-order mark stripped if present.
2. The header row is parsed and each name trimmed.
3. Headers are checked against `input.fields`:
   - a **missing** declared column is an error and the file is refused,
   - an **extra** column is a warning and is ignored,
   - a **duplicate** column is a warning.
4. Each remaining row becomes a record, and each cell is coerced to its declared type.

## What happens on write

`*-output` is generated from your output schema: columns in declaration order, values
serialised per type, quoting applied where needed.

`*-remaining` is different — it is **re-emitted** from the original rows, in the input
schema, so it can be loaded straight back in.

## The re-emit contract

`*-remaining` is **value-faithful, not byte-faithful.** This is the guarantee downstream
code may rely on:

**Preserved exactly** — every value, the column order, and the detected dialect. This is
verified by a property test that parses, re-emits, and parses again.

**Not preserved** — a byte-order mark, whitespace padding in header names, the original
quoting style, blank lines, and whether the file ended with a newline.

For reloading into MLabel, or into anything that parses CSV, none of that matters. If you
are diffing against the original file byte-for-byte, expect noise that is not a data change.

## Adding a format

Nothing about MLabel's core, its UI, or the config schema knows what CSV is. A new format
means implementing two interfaces and registering them — no changes anywhere else. See
[Writing an adapter](/dev/adapters/).

Format specifics stay private to the adapter behind an opaque token, which is what keeps
that promise honest rather than aspirational.
