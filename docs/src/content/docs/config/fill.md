---
title: Fill — where values come from
description: The four fill kinds, how required-ness follows from them, and why fill is separate from the widget.
---

Every output field has a **fill**: where its value comes from. It defaults to `user`.

```jsonc
{ "name": "verdict", "type": "text" }                            // fill: user
{ "name": "id",      "type": "text", "fill": { "kind": "copy" } } // copied
```

Fill is independent of the type and of the widget. Type says _what the value is_, widget
says _what it looks like_, fill says _who provides it_.

## The four kinds

### `user`

The labeler answers it on **every record**. This is the default and the common case.

### `session`

The labeler answers it **once**, on a setup screen before labeling starts, and the answer
is written onto every exported row.

```jsonc
{ "name": "annotator", "type": "text", "fill": { "kind": "session" } },
{
  "name": "guidelineVersion",
  "type": "enum",
  "fill": { "kind": "session" },
  "choices": [{ "name": "v3" }, { "name": "v4" }],
},
```

Use it for facts about the **run** rather than the record. A session field renders a widget
like any other — just on a different screen.

:::note
Session answers do not make a record count as _started_. Otherwise every untouched record
would read as partially labeled the moment the setup screen was answered.
:::

### `copy`

Carried over from an input column. Renders no widget — nobody is asked.

```jsonc
// Same name on both sides.
{ "name": "id", "type": "text", "fill": { "kind": "copy" } },

// Renamed on the way out: input `id` becomes output `sourceId`.
{ "name": "sourceId", "type": "text", "fill": { "kind": "copy", "from": "id" } },

// One input column copied into two output columns is fine.
{ "name": "auditId", "type": "text", "fill": { "kind": "copy", "from": "id" } },
```

`from` defaults to the field's own name.

:::caution[The types must match]
A `copy` field's declared type must be **identical** to its source field's type:

```jsonc
// input:  { "name": "id", "type": "text" }
{ "name": "id", "type": "integer", "fill": { "kind": "copy" } }
// ✗ Type "integer" does not match input field "id" of type "text".
```

This is not fussiness. Prepare re-reads `*-output` cell by cell using the declared type, so
a mismatch silently mistypes the column on the way back in.
:::

### `timestamp`

Stamped by the app when the record becomes complete, and re-stamped on every later edit to
it. Renders no widget.

```jsonc
{ "name": "labeledAt", "type": "date", "fill": { "kind": "timestamp" } }
```

The value reflects when the record was _finished_, not when it was first opened.

## Interactive vs derived

| Fill        | Renders a widget? | Required by default? |
| ----------- | ----------------- | -------------------- |
| `user`      | yes               | **yes**              |
| `session`   | yes               | **yes**              |
| `copy`      | no                | no                   |
| `timestamp` | no                | no                   |

The default is the sensible one: something a person is _asked for_ is required; something
the app _derives_ is not. An explicit `required` always wins.

```jsonc
{ "name": "notes",  "type": "text", "required": false },                        // optional
{ "name": "id",     "type": "text", "fill": { "kind": "copy" }, "required": true }, // must be present
```

Because a derived field renders nothing, naming a `widget` or a `shortcut` on one is an
error — there would be nothing to render or focus:

```jsonc
{ "name": "id", "type": "text", "fill": { "kind": "copy" }, "widget": "text" }
// ✗ A "copy" field renders no widget.
```

## Why fill is explicit

Earlier versions inferred it: an output field was copied when its name _happened_ to match
an input column, and `control: "hidden"` conflated rendering with sourcing. That made three
reasonable things impossible — renaming a copied column, capturing into a field whose name
collides with an input column, and copying one input into two outputs.

Stating it outright costs one line and removes the whole class of surprise.

## What actually gets written

A row's exported values come from three places, merged in one place so that the progress
bar, the form and the export can never disagree:

```
per-record labels  ──┐
session answers    ──┼──▶ the exported row
timestamp          ──┘
```

Copied values are seeded when the record loads, so they are present from the start.

## Full reference

[Fill](/reference/fill/) · [OutputField](/reference/output-field/)
