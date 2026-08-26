---
title: Cookbook
description: Working recipes for the shapes that come up repeatedly — multi-select, audit trails, renamed columns, nested tables, offline configs.
---

Each recipe is a fragment you can paste in. All of them validate.

## Multi-select

An `array` of `enum`. This is the only way to declare "more than one may apply".

```jsonc
{
  "name": "issues",
  "type": "array",
  "display": "Problems present",
  "items": {
    "type": "enum",
    "choices": [
      { "name": "toxic", "display": "Toxic", "shortcut": "t" },
      { "name": "off-topic", "display": "Off topic", "shortcut": "o" },
      { "name": "unhelpful", "display": "Unhelpful", "shortcut": "u" },
    ],
  },
  "required": false,
}
```

Choice chords **toggle** here rather than replace. Selected values export in declaration
order, not click order, so the cell is stable however the labeler got there.

Make it `required: false` unless "no problems" is genuinely impossible — an empty
multi-select reads as unanswered, so a required one forces at least one selection.

## An audit trail

Who labeled it, when, and against which guidelines — without asking per record.

```jsonc
"output": {
  "fields": [
    { "name": "id", "type": "text", "fill": { "kind": "copy" } },

    { "name": "verdict", "type": "enum", "choices": [{ "name": "pass" }, { "name": "fail" }] },

    // Asked once, on the setup screen.
    { "name": "annotator", "type": "text", "fill": { "kind": "session" } },
    {
      "name": "guidelines",
      "type": "enum",
      "fill": { "kind": "session" },
      "choices": [{ "name": "v3" }, { "name": "v4" }],
    },

    // Stamped when the record becomes complete.
    { "name": "labeledAt", "type": "date", "fill": { "kind": "timestamp" } },
  ],
  "cards": [
    {
      "name": "run",
      "scope": "session",
      "display": { "title": "About this run", "description": "Asked once, applied to every row." },
      "rows": [{ "perRow": 2, "use": ["annotator", "guidelines"] }],
    },
    { "name": "labels", "display": "Labels", "rows": [{ "use": ["verdict"] }] },
  ],
}
```

Session fields need a `scope: "session"` card, or they leave a hole in the per-record grid.

## Renaming a column on the way out

```jsonc
// input has { "name": "id", "type": "text" }
{ "name": "sourceId", "type": "text", "fill": { "kind": "copy", "from": "id" } }
```

Copying one input into two outputs is allowed:

```jsonc
{ "name": "sourceId", "type": "text", "fill": { "kind": "copy", "from": "id" } },
{ "name": "auditKey", "type": "text", "fill": { "kind": "copy", "from": "id" } },
```

## A nested table with grouped columns

An `array` of `object` renders as a table. `table.columns` combines members so the table
stays narrow:

```jsonc
{
  "name": "checks",
  "type": "array",
  "display": { "title": "Safety checks", "titlePosition": "above" },
  "items": {
    "type": "object",
    "fields": [
      { "name": "name", "type": "text", "display": "Check" },
      { "name": "passed", "type": "boolean", "display": "Passed" },
      { "name": "confidence", "type": "number", "display": "Confidence" },
    ],
    "table": {
      "columns": [
        { "name": "Check", "use": ["name"] },
        // Two members in one cell.
        { "name": "Result", "use": ["passed", "confidence"], "layout": "inline" },
      ],
    },
  },
}
```

`layout` is `chips` (default), `stack` or `inline`.

Column `use` names the **object's own** members, not top-level fields.

## A dictionary of objects

```jsonc
{
  "name": "annotators",
  "type": "map",
  "display": { "title": "Prior annotations", "titlePosition": "above" },
  "values": {
    "type": "object",
    "fields": [
      { "name": "role", "type": "text", "display": "Role" },
      { "name": "confidence", "type": "number", "display": "Confidence" },
    ],
  },
}
```

`keys` defaults to text and is rarely worth stating.

## Highlighting suspicious input

```jsonc
"rules": [
  {
    "name": "canned-refusal",
    "when": { "op": "matches", "field": "response", "pattern": "^(I'm sorry|As an AI)" },
    "appliesTo": ["response"],
    "style": { "tone": "muted", "note": "Canned refusal — deprioritize." },
  },
  {
    "name": "below-threshold",
    "when": { "op": "lt", "field": "score", "otherField": "threshold" },
    "appliesTo": ["score", "threshold"],
    "style": { "tone": "warning", "note": "Below the configured threshold." },
  },
  {
    "name": "no-explanation",
    "when": { "op": "empty", "field": "rationale" },
    "style": { "tone": "info", "note": "The model gave no rationale." },
  },
]
```

When a rule compares two fields, set `appliesTo` — the default of "style the field being
tested" highlights only half the story.

## A fully offline config

```jsonc
{
  "$schema": "https://mlabel.vlad.gg/mlabel.schema.json",
  "version": 2,
  "network": { "updateChecks": false },
  "input": {
    /* … */
  },
  "output": {
    /* … */
  },
}
```

No network requests of any kind. See [Network policy](/config/network/).

:::note
The `$schema` URL is only read by your editor while writing the config. MLabel itself never
fetches it, so it does not compromise an offline deployment.
:::

## A semicolon-delimited source

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

The two sides take different keys — see [Adapters](/config/adapters/#adapterconfig).

## A fast three-key form

The digits are free and need no declaration:

```jsonc
{
  "name": "verdict",
  "type": "enum",
  "widget": "radio",
  "display": "Verdict",
  "choices": [
    { "name": "correct", "display": "Correct" },
    { "name": "incorrect", "display": "Incorrect" },
    { "name": "unclear", "display": "Unclear" },
  ],
}
```

The labeler presses <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> then <kbd>Enter</kbd>. Add
explicit chords only when a second choice field competes for the digits, or when a mnemonic
would survive reordering.

## An optional free-text note

```jsonc
{
  "name": "notes",
  "type": "text",
  "widget": "textarea",
  "required": false,
  "maxLength": 500,
  "display": { "title": "Notes", "titlePosition": "above" },
}
```

`required: false` matters — a `user`-filled field is required by default, and a mandatory
notes box on every record is a good way to slow a project to a crawl.
