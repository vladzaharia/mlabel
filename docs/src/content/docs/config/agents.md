---
title: Configuration authoring checklist
description: A compact checklist for tools and repository contributors that generate configuration files.
---

This checklist is for tools and repository contributors authoring configuration files. For a guided introduction, use [Create your first project](/admin/first-project/). It documents the same public configuration format.

## Machine-readable sources

| Resource                                    | What it is                                    |
| ------------------------------------------- | --------------------------------------------- |
| `https://mlabel.vlad.gg/mlabel.schema.json` | The authoritative JSON Schema. Draft 2020-12. |
| `https://mlabel.vlad.gg/llms.txt`           | Index of every docs page.                     |
| `https://mlabel.vlad.gg/llms-full.txt`      | Every page's prose in one request.            |

Fetch the schema and validate against it if you can. It is generated from the same source
the app validates with, so it matches the structural contract. The app also performs cross-field checks that JSON Schema cannot express; run the application validator before handing back a file.

## Non-negotiables

1. **`"version": 2` is required.** Omitting it is a hard failure with a distinct message.
2. **Every object is strict.** An unrecognised key is an error, not a warning. Do not invent
   keys. The single exception is `adapterConfig`.
3. **A field is a type.** `type` decides which other keys are legal. Do not put `minLength`
   on a number or `min` on text.
4. **Nothing is inferred.** An output field that should copy an input column must say so
   with `fill`. Matching names alone does nothing.

## Procedure

Work in this order. Each step depends on the one before it.

### 1. Enumerate the source columns

Read the actual data file if you have it. Get the exact header spellings — matching is
exact, modulo surrounding whitespace being trimmed.

### 2. Declare `input.fields`

One per column you want to display. Choose a `type` per column from
[the nine](/config/types/):

- a free-text column → `text`
- a whole number → `integer`; anything fractional → `number`
- `true`/`false`/`yes`/`no`/`1`/`0` → `boolean`
- a date → `date`
- a fixed vocabulary → `enum` with `choices`
- a JSON list → `array` with `items`
- a JSON object → `object` with `fields`, or `map` with `values` if the keys are open-ended

You may omit columns you do not want shown. You may **not** declare a column that is not in
the file — that is a blocking load error.

### 3. Decide what is captured

For each output column, answer three independent questions:

| Question          | Answer goes in | Default        |
| ----------------- | -------------- | -------------- |
| What is it?       | `type`         | — (required)   |
| Who provides it?  | `fill`         | `user`         |
| How does it look? | `widget`       | type's default |

Do not set `widget` unless you are deviating from the default. Do not set `fill` for
`user`.

### 4. Wire up copies carefully

```jsonc
{ "name": "id", "type": "text", "fill": { "kind": "copy" } }
```

**The type must match the source field's type exactly.** Check this for each copied field. If input `id` is `text`, the output field must be `text` — not `integer`, even if
every value looks like a number.

### 5. Group into cards

Optional. Omitting `cards` gives one card, one field per row, which is fine for a small
config. If you do declare cards, **every field name in every `use` must exist on that
side**, and a field no card names is not displayed.

### 6. Add rules and shortcuts last

Both are refinements. Neither is required, and both have collision rules that are easier to
satisfy once the fields are settled.

### 7. Validate

```bash
pnpm validate path/to/config.jsonc
```

Exit code 0 confirms configuration validation. Still test representative data and a real export. Errors include a line, column, and field path when available.

:::caution[Repeat validation until it succeeds]
Validation runs in three stages — syntax, then shape, then coherence — and each only runs if
the previous one passed. A single unknown key is a _shape_ failure, and it hides **every**
coherence diagnostic behind it. Fixing one error routinely reveals several more.

Loop: validate, fix everything reported, validate again. Stop only on exit code 0.
:::

## What will be rejected

These message patterns use placeholder field names. [Full catalogue with fixes](/config/errors/).

| Message                                                                  | Cause                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------- |
| `This config has no \`version\`…`                                        | Missing `"version": 2`                          |
| `Unsupported config version N…`                                          | Wrong version                                   |
| `Unrecognized key: "X"`                                                  | Invented or misspelled key                      |
| `must be a column name: …`                                               | `.` `[` `]` `*` or edge whitespace in a name    |
| `Duplicate input field "X".`                                             | Repeated name on one side                       |
| `Card "C" references unknown input field "X".`                           | `use` names a nonexistent field                 |
| `Table column "C" references unknown object field "X".`                  | Column `use` must name the object's own members |
| `Copies from unknown input field "X".`                                   | `fill.from` (or the field's own name) not found |
| `Type "A" does not match input field "X" of type "B".`                   | Copy type mismatch                              |
| `"object" fields cannot be filled by a user; give the field a \`fill\`.` | `object`/`map` output with no `fill`            |
| `A "copy" field renders no widget.`                                      | `widget` on a derived field                     |
| `A "timestamp" field renders no widget, so there is nothing to focus.`   | `shortcut` on a derived field                   |
| `Shortcut "X" is already used by …`                                      | Chords share one namespace config-wide          |
| `Shortcut "X" is reserved by the app or the OS.`                         | See the reserved list                           |
| `e.g. "p" or "mod+s"`                                                    | Malformed chord                                 |
| `Rule references unknown input field "X".`                               | Rules see input fields only                     |
| `Give exactly one of \`value\` or \`otherField\`.`                       | Comparison needs exactly one comparand          |
| `Invalid regular expression.`                                            | Bad `pattern` (remember JSON escaping: `"\\d"`) |
| `Too small: expected array to have >=1 items`                            | Empty `choices`, `fields`, `rows` or `use`      |

## Minimal valid config

```jsonc
{
  "$schema": "https://mlabel.vlad.gg/mlabel.schema.json",
  "version": 2,
  "input": {
    "fields": [{ "name": "text", "type": "text" }],
  },
  "output": {
    "fields": [
      { "name": "label", "type": "enum", "choices": [{ "name": "good" }, { "name": "bad" }] },
    ],
  },
}
```

## Runnable examples

Use the [illustrated cookbook](/config/cookbook/) and its downloadable files as complete examples. Prefer a small example matching the user's task over an all-features configuration. The screenshot on each recipe page shows the exact downloaded project.

## Self-check before handing back

- [ ] `"version": 2` present.
- [ ] Every input field name exists as a column in the real data file.
- [ ] Every `fill: copy` field's type is **identical** to its source field's type.
- [ ] No `object` or `map` output field lacks a `fill`.
- [ ] No `widget` or `shortcut` on a `copy` or `timestamp` field.
- [ ] Every chord is unique across the whole config, and none is reserved.
- [ ] Every card `use` names a field declared on that same side.
- [ ] Every session-filled field sits in a `scope: "session"` card.
- [ ] Every table column `use` names its own object's members.
- [ ] Every regex is valid **after** JSON unescaping.
- [ ] Optional fields are marked `"required": false` — `user` fields are required by default.
- [ ] `pnpm validate` exits 0.

## Things that are legal but usually wrong

- **A required free-text field on every record.** It is required by default; that is rarely
  what you want for a notes box.
- **A required multi-select.** An empty selection reads as unanswered, so the labeler is
  forced to tick something.
- **Declaring `widget` everywhere.** The defaults are good. Naming them adds noise and one
  more thing to get wrong.
- **Rules that state a conclusion.** A rule is a hint the labeler may disagree with. "Looks
  toxic — check" invites judgement; "This is toxic" biases the dataset you are building.
- **Many fields, no cards.** Past four or five fields, the implicit one-per-row layout gets
  hard to read.
