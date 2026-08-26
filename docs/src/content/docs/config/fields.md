---
title: Fields
description: The shape every field shares, the naming rules and why they are what they are, and how input and output fields differ.
---

A field declares one column. Input fields and output fields share one shape, so what you
learn on one side applies to the other.

## The shared shape

```jsonc
{
  "name": "score", // the column header in the data file
  "type": "number", // what the value is — decides which other keys are legal
  "display": "Model score", // captions and layout (optional)
  // …plus whatever this type carries: min, max, step
}
```

## Naming

`name` is the **column header in the data file**, matched exactly. Permitted characters:

- letters, digits, `_` and `-`,
- inner spaces (`model score` is fine),
- but **not** leading or trailing whitespace,
- and **not** `.` `[` `]` `*`.

The two exclusions are deliberate:

- `.` `[` `]` `*` are reserved for a future rule path grammar (`checks[*].toxic`) and would
  be ambiguous in the dotted paths the loader reports errors against.
- Edge whitespace is excluded because CSV headers are trimmed when read but written
  verbatim. A padded name would fail to round-trip through Prepare's join.

Names must be **unique within their side**. An input `id` and an output `id` are fine and
unrelated — the connection between them is only ever what [`fill`](/config/fill/) states.

:::note
Names _inside_ an `object` type are different: they are JSON keys from your source payload,
not column headers, so they are deliberately unconstrained. Colons, slashes and unicode all
work.
:::

## Input fields

An input field declares a source column and how to display it. It takes `name`, `type`,
`display` and the type's own constraints — nothing else.

```jsonc
"input": {
  "fields": [
    { "name": "id", "type": "text" },
    { "name": "prompt", "type": "text", "display": { "title": "Prompt", "titlePosition": "above" } },
    { "name": "score", "type": "number", "min": 0, "max": 1, "display": "Model score" },
  ],
}
```

Constraints on an input field are documentation and coercion guidance, not gates: a value
outside `min`/`max` still displays. Only a value that cannot be _coerced to the type at all_
is flagged, and even then the file still loads.

**A declared input column must exist in the file.** A missing one is a blocking error and
the file is refused. Extra columns in the file are ignored with a warning.

## Output fields

An output field declares a column to write. It adds four keys:

| Key        | Meaning                                                      |
| ---------- | ------------------------------------------------------------ |
| `fill`     | [Where the value comes from](/config/fill/). Default `user`. |
| `widget`   | [How it renders](/config/widgets/). Type-specific default.   |
| `required` | Whether a record is complete without it. Defaults by fill.   |
| `shortcut` | [A chord that focuses it](/config/shortcuts/).               |

```jsonc
"output": {
  "fields": [
    { "name": "id", "type": "text", "fill": { "kind": "copy" } },
    {
      "name": "verdict",
      "type": "enum",
      "widget": "radio",
      "shortcut": "mod+1",
      "display": "Your verdict",
      "choices": [{ "name": "pass" }, { "name": "fail" }],
    },
    { "name": "notes", "type": "text", "widget": "textarea", "required": false },
  ],
}
```

Unlike input, output constraints **are** enforced: a value that violates `maxLength`,
`min`/`max` or `pattern` keeps the record out of `*-output`. That asymmetry is the point —
a labeler can fix their own answer, but cannot fix the source data.

## Column order

Fields are written to the output file in the order they are declared. If a downstream
consumer cares about column order, declare them in that order.

## Full reference

[InputField](/reference/input-field/) · [OutputField](/reference/output-field/)
