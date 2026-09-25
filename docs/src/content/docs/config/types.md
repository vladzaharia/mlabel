---
title: Value types
description: The nine value types, the constraints each carries, and how raw cells are coerced into them.
---

A field **is** its type. The `type` tag decides which other keys are legal — constraints
live where the type is, so `minLength` can only appear on text and `min` only on a number.

The same nine types are used on both sides of the config, and nest inside each other.

## The nine

| Type      | Holds                         | Own keys                            |
| --------- | ----------------------------- | ----------------------------------- |
| `text`    | A string                      | `minLength`, `maxLength`, `pattern` |
| `integer` | A whole number                | `min`, `max`, `step`                |
| `number`  | A number, whole or fractional | `min`, `max`, `step`                |
| `boolean` | true / false                  | —                                   |
| `date`    | A date                        | —                                   |
| `enum`    | One of a fixed set            | `choices`                           |
| `object`  | A record with named members   | `fields`, `table`                   |
| `array`   | A list                        | `items`                             |
| `map`     | A dictionary                  | `keys`, `values`                    |

## Scalars

```jsonc
{ "name": "title",   "type": "text", "minLength": 1, "maxLength": 200 },
{ "name": "email",   "type": "text", "pattern": "^[^@\\s]+@[^@\\s]+$" },
{ "name": "rating",  "type": "integer", "min": 1, "max": 5, "step": 1 },
{ "name": "score",   "type": "number", "min": 0, "max": 1, "step": 0.01 },
{ "name": "flagged", "type": "boolean" },
{ "name": "created", "type": "date" },
```

`pattern` is a JavaScript regular expression. It is compiled when the config loads, so a
malformed one is a config error rather than a surprise at render time.

:::caution[`step` is not a constraint]
`step` sizes the increment on a number box or slider. It is **never** used for validation —
three clicks of a `0.1` slider legitimately produce `0.30000000000000004`, and rejecting
that would be absurd. If you need a real constraint, use `min` and `max`.
:::

## `enum`

```jsonc
{
  "name": "sentiment",
  "type": "enum",
  "choices": [
    { "name": "positive", "display": "Positive", "shortcut": "p" },
    { "name": "neutral", "display": "Neutral" },
    { "name": "negative", "display": "Negative", "selectedStyle": { "tone": "danger" } },
  ],
}
```

A choice's `name` is **the literal string written to the file**; `display.title` is only
what the labeler sees. Choice names are trimmed and cannot be empty — an empty choice would
read back as no value at all, making it both unselectable and impossible to round-trip.

See [Shortcuts](/config/shortcuts/) for `shortcut`, and [Display](/config/display/) for
`selectedStyle`.

## `array`

```jsonc
// A list of strings — renders as chips.
{ "name": "tags", "type": "array", "items": { "type": "text" } },

// A multi-select — an array of enum is the only way to declare one.
{
  "name": "issues",
  "type": "array",
  "items": {
    "type": "enum",
    "choices": [{ "name": "toxic" }, { "name": "off-topic" }, { "name": "unhelpful" }],
  },
},
```

An `array` of `enum` is a genuinely important idiom: it is how you get checkboxes where more
than one answer is allowed. Selected values are written in **declaration order**, not click
order, so the exported cell is stable however the labeler arrived at it.

## `object`

```jsonc
{
  "name": "checks",
  "type": "array",
  "items": {
    "type": "object",
    "fields": [
      { "name": "name",   "type": "text",    "display": "Check" },
      { "name": "passed", "type": "boolean", "display": "Passed" },
    ],
  },
},
```

An `array` of `object` renders as a table, one row per element. `object.table` controls how
its members group into displayed columns — see [TableView](/reference/table-view/).

Names inside an `object` are JSON keys from your source payload, not column headers, so
they are deliberately unconstrained: colons, slashes and unicode are all fine.

## `map`

```jsonc
{ "name": "tokenCounts", "type": "map", "values": { "type": "integer" } },

{
  "name": "annotators",
  "type": "map",
  "values": {
    "type": "object",
    "fields": [
      { "name": "role",       "type": "text" },
      { "name": "confidence", "type": "number" },
    ],
  },
},
```

`keys` defaults to text and is rarely worth stating. A `map` of `object` renders as a table
keyed by its entries.

## `object` and `map` are display-only

Neither can be filled by a person. There is no widget that could sensibly capture an
arbitrary nested structure, so an output field of either type **must** declare a
[`fill`](/config/fill/) that does not involve asking:

```jsonc
{ "name": "meta", "type": "object", "fields": [ /* … */ ] }
// ✗ "object" fields cannot be filled by a user; give the field a `fill`.

{ "name": "meta", "type": "object", "fields": [ /* … */ ], "fill": { "kind": "copy" } }
// ✓
```

## How raw values become typed ones

CSV cells are strings. Each is coerced according to its declared type when the file loads.

| Type               | Accepts                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `text`             | Anything; non-strings are stringified.                                           |
| `number`           | Anything `Number()` parses, after trimming.                                      |
| `integer`          | The same, but rejects a fractional result.                                       |
| `boolean`          | `true` `false` `1` `0` `yes` `no` `y` `n`, case-insensitive.                     |
| `date`             | ISO-8601 and a range of everyday formats. See [Dates](#dates).                   |
| `enum`             | Must be exactly one of the choice names.                                         |
| composite          | A JSON string at the top level, then recursively coerced.                        |
| `array` of scalars | JSON first; failing that, a stringy list. See [Lists](#lists-that-are-not-json). |

**An empty cell becomes `null`**, for every type. Empty is not zero, not `false`, and not
an empty list — it is the absence of a value, which is what makes required-ness meaningful.

A cell that will not coerce does not refuse the file. The value shows as empty with a
warning icon you can hover or focus for the reason, and the labeler carries on — they cannot
fix the source data, so it is information rather than a task. See
[Troubleshooting](/guide/troubleshooting/).

### Dates

MLabel reads more than `new Date()` does, because exports are rarely tidy:

| Written as                       | Read as                                             |
| -------------------------------- | --------------------------------------------------- |
| `2026-05-01`, `2026/05/01`       | that calendar day                                   |
| `20260501`                       | that calendar day                                   |
| `01/05/2026`                     | **5 January** — month first                         |
| `25/12/2026`                     | 25 December — day first, since 25 cannot be a month |
| `2026-05-01 14:30`, `…T14:30:00` | that date and time                                  |
| `…T14:30:00Z`, `…+02:00`         | that instant, in the zone given                     |
| `1767225600` / `1767225600000`   | Unix seconds / milliseconds                         |

An all-numeric date with both parts under 13 is **month-first**, matching what JavaScript
has always done with `01/05/2026`. It is genuinely ambiguous; write ISO if you can.

**Everything is read and displayed as UTC, including values that name no zone.** A value
that names no zone has not told MLabel one, and adopting the labeler's would mean two people
in two countries exporting different bytes for the same input file.

A date with no time of day displays as a date; one carrying a time displays with it. MLabel
knows which by looking at the value, so a source that says exactly `2026-05-01T00:00:00Z` is
indistinguishable from one that says `2026-05-01`, and displays as a plain date.

### Lists that are not JSON

An `array` of scalars accepts JSON first. If that fails, MLabel falls back to reading the
cell as a stringy list: it strips one matched layer of `[]`, `()` or `{}`, splits on commas,
semicolons, pipes or newlines, and unquotes each item.

```
a, b, c          →  ["a", "b", "c"]
[1; 2]           →  [1, 2]
'red', green     →  ["red", "green"]
```

Valid JSON always wins, so `["a, b"]` stays a single item. The fallback can only rescue
cells that were previously a hard error.

It applies **only to lists of scalars**. For an `array` of `object`, a `map` or an `object`,
splitting on commas would quietly mis-assign data rather than fail, so those stay strict JSON
and a malformed cell is reported.

One consequence worth knowing: a column read this way and carried into the output with
`fill: copy` is written back as JSON. `*-output.*` has never promised byte-for-byte fidelity,
but `a, b` in becomes `["a","b"]` out.

## Full reference

[InputField](/reference/input-field/) · [OutputField](/reference/output-field/) ·
[ValueType](/reference/value-type/) · [NestedField](/reference/nested-field/)
