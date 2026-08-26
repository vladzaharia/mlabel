---
title: Anatomy of a config
description: The shape of an MLabel config file, the two rules that govern all of it, and a worked example from minimal to complete.
---

A config is one `.jsonc` file — JSON with comments and trailing commas — that fully
describes what MLabel shows and what it captures.

## The smallest working config

```jsonc
{
  "$schema": "https://mlabel.vlad.gg/mlabel.schema.json",
  "version": 2,
  "input": {
    "fields": [{ "name": "text", "type": "text" }],
  },
  "output": {
    "fields": [
      {
        "name": "label",
        "type": "enum",
        "choices": [{ "name": "good" }, { "name": "bad" }],
      },
    ],
  },
}
```

That is a complete, valid config. It reads a CSV with a `text` column, shows it, and asks
for one of two labels. Everything else — layout, widgets, required-ness — has a sensible
default.

## The two rules

Almost everything else follows from these.

### 1. Every object is strict

An unrecognised key is an **error**, not a silently ignored one:

```jsonc
"network": { "updateCheck": false }   // ✗ Unrecognized key: "updateCheck"
```

This is not pedantry. A silently dropped `updateChecks` would leave the permissive default
in place, so a config that reads as opting out of all network would still be making
requests. Failing loudly is the only safe behaviour.

The single exception is [`adapterConfig`](/config/adapters/), which is owned by the adapter
rather than by MLabel — the core never inspects it, so it cannot judge what belongs there.

### 2. A field is a type

`type` is a flat tag, and it decides which other keys exist:

```jsonc
{ "name": "notes",  "type": "text",   "maxLength": 500 }   // ✓ maxLength is a text key
{ "name": "rating", "type": "integer", "min": 1, "max": 5 } // ✓ min/max are number keys
{ "name": "notes",  "type": "text",   "min": 1 }            // ✗ min is not a text key
```

Input and output fields share this shape. Output fields add two more keys, which are
independent of the type and of each other:

- [`fill`](/config/fill/) — **who** provides the value.
- [`widget`](/config/widgets/) — **how** it renders.

## Top level

| Key       | Required | What it does                                              |
| --------- | -------- | --------------------------------------------------------- |
| `$schema` | no       | Points editors at the JSON Schema for autocomplete.       |
| `version` | **yes**  | Must be `2`. See [Versioning](/config/versioning/).       |
| `ui`      | no       | Window title.                                             |
| `network` | no       | The update-check switch. See [Network](/config/network/). |
| `input`   | **yes**  | Columns to read and display.                              |
| `output`  | **yes**  | Columns to write.                                         |

`input` and `output` each take `adapterId`, `adapterConfig`, `fields` and `cards`; `input`
additionally takes `rules`. Full key-by-key detail is in
[the generated reference](/reference/).

## Growing the example

Adding display, layout, a copied ID and a timestamp:

```jsonc
{
  "$schema": "https://mlabel.vlad.gg/mlabel.schema.json",
  "version": 2,

  // Track the record on screen in the window title.
  "ui": { "appTitle": { "field": "id" } },

  "input": {
    "fields": [
      { "name": "id", "type": "text" },
      {
        "name": "text",
        "type": "text",
        // A bare string is shorthand for { "title": "…" }.
        "display": { "title": "Text under review", "titlePosition": "above", "textSize": "lg" },
      },
      { "name": "score", "type": "number", "min": 0, "max": 1, "display": "Model score" },
    ],

    // Purely visual. Rules can never change what is exported.
    "rules": [
      {
        "name": "very-confident",
        "when": { "op": "gt", "field": "score", "value": 0.9 },
        "style": { "tone": "warning", "note": "Unusually confident — check carefully." },
      },
    ],

    "cards": [
      {
        "name": "sample",
        "display": "Sample",
        "rows": [{ "use": ["text"] }, { "perRow": 2, "use": ["id", "score"] }],
      },
    ],
  },

  "output": {
    "fields": [
      // Carried over from the input column of the same name.
      { "name": "id", "type": "text", "fill": { "kind": "copy" } },
      {
        "name": "label",
        "type": "enum",
        "widget": "radio",
        "display": "Your label",
        "choices": [
          { "name": "good", "display": "Good", "shortcut": "g" },
          {
            "name": "bad",
            "display": "Bad",
            "shortcut": "b",
            "selectedStyle": { "tone": "danger" },
          },
        ],
      },
      {
        "name": "notes",
        "type": "text",
        "widget": "textarea",
        "required": false,
        "maxLength": 500,
      },
      // Answered once at the start, written onto every row.
      { "name": "annotator", "type": "text", "fill": { "kind": "session" } },
      // Stamped by the app when a record becomes complete.
      { "name": "labeledAt", "type": "date", "fill": { "kind": "timestamp" } },
    ],
    "cards": [
      {
        "name": "labels",
        "display": "Labels",
        "rows": [{ "use": ["label"] }, { "use": ["notes"] }],
      },
    ],
  },
}
```

## Check your work

```bash
pnpm validate path/to/config.jsonc
```

Every problem is reported at once, with a line, column and path. See
[Every error explained](/config/errors/).

## Where to go next

- [Value types](/config/types/) — the nine types and their constraints.
- [Fill](/config/fill/) — where an output value comes from.
- [Cookbook](/config/cookbook/) — recipes for common shapes.
- [Authoring as an agent](/config/agents/) — a procedure for models.
