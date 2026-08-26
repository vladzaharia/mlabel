---
title: Every error explained
description: The complete catalogue of config rejection messages, what each one means, and how to fix it.
---

Check a config without launching the app:

```bash
pnpm validate path/to/config.jsonc
```

The messages below are exact.

## Validation happens in three stages

Each stage only runs if the one before it passed, so **fixing an error can reveal new ones**.
That is not the config getting worse — it is the next stage finally getting to run.

| Stage            | Checks                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| 1. **Syntax**    | Is it parseable JSONC?                                                         |
| 2. **Shape**     | Are the keys and types right? Unknown keys, wrong types, bad names.            |
| 3. **Coherence** | Do the parts agree? Dangling references, type mismatches, shortcut collisions. |

Within a stage, **everything** is reported at once — there is no fix-one-rerun-find-the-next
loop inside a stage. But a single unknown key in stage 2 hides every stage 3 diagnostic
behind it:

```
"network": { "updateCheck": false }   ← one typo
→ 1 problem:  Unrecognized key: "updateCheck"

fix it, re-run
→ 2 problems: Type "integer" does not match input field "prompt" of type "text".
              Shortcut "mod+v" is reserved by the app or the OS.
```

Re-run until it is clean rather than assuming the first clean-ish result is final.

## Version

### `This config has no \`version\`. MLabel 0.3 and later require "version": 2 and a rewritten schema.`

Add `"version": 2` at the top level. If the file predates v2, it needs more than the key —
see [Versioning](/config/versioning/#coming-from-v1).

### `Unsupported config version 1. This build reads version 2.`

The config is written for a different format version. Both directions are refused: a newer
config in an older build fails just as cleanly.

:::note
The version is checked **before** everything else, deliberately. A v1 config measured
against the v2 schema produces nine errors with the real cause buried among eight
consequences.
:::

## Syntax

### `JSONC syntax error: PropertyNameExpected` (and similar)

Malformed JSON. Comments and trailing commas _are_ allowed — this is `.jsonc` — so the cause
is usually a missing comma, an unclosed brace, or a stray one.

You may see two syntax errors for one mistake; fix the first and re-run.

## Unknown keys

### `Unrecognized key: "updateCheck"`

A typo, or a key that does not exist on that object. Every object in the config is strict.

This is the single most valuable check in the schema. A silently dropped `updateChecks`
would leave the permissive default in place, so a config that reads as opting out of all
network would still be making requests.

The one place unknown keys are allowed is
[`adapterConfig`](/config/adapters/#adapterconfig), which is owned by the adapter.

## Names

### `must be a column name: letters, digits, _ or -, with optional inner spaces`

A field or card name used a forbidden character. `.` `[` `]` `*` are reserved for a future
rule path grammar, and leading or trailing whitespace is excluded because it would not
round-trip through a CSV header. See [Fields](/config/fields/#naming).

### `Duplicate input field "id".`

Also `Duplicate output field`, `Duplicate input card`, `Duplicate output card`. Names must be
unique **within their side**. An input `id` and an output `id` are fine and unrelated.

## References that go nowhere

### `Card "c" references unknown input field "missing".`

A card's `use` lists a field that side does not declare. Check for a typo, or a field
declared on the other side.

### `Table column "C" references unknown object field "zzz".`

A table column names a member the object does not have. Table columns address **their own
object's** fields, not the top-level ones — which is easy to forget, because the object
carrying the column list is usually nested inside an `array` or a `map`.

### `Rule references unknown input field "ghost".`

A rule's `when.field`, `when.otherField`, or an entry in `appliesTo` names a field that does
not exist. Rules can only see **input** fields.

### `Unknown input field "nope".`

`ui.appTitle.field` names a field that does not exist.

### `Copies from unknown input field "ghost".`

A `fill: { "kind": "copy" }` field points at an input column that is not declared. Remember
`from` defaults to the field's own name, so this also fires when you add a copy field whose
name has no input counterpart.

## Fill and type

### `Type "integer" does not match input field "id" of type "text".`

A copied field's declared type must be **identical** to its source. Prepare re-reads
`*-output` cell by cell using the declared type, so a mismatch silently mistypes the column
on the way back in. Fix whichever side is wrong.

### `"object" fields cannot be filled by a user; give the field a \`fill\`.`

Also for `map`. There is no widget that could capture an arbitrary nested structure, so an
output field of either type must be `copy`, `session` or `timestamp` — realistically
`copy`. See [Widgets](/config/widgets/#composite-types-render-no-widget).

### `A "copy" field renders no widget.`

A `widget` on a field nobody fills. Remove it. Same for `timestamp`.

### `A "timestamp" field renders no widget, so there is nothing to focus.`

A `shortcut` on a field nobody fills. Remove it. Same for `copy`.

## Shortcuts

### `Shortcut "z" is already used by choice "y" on "f".`

Field chords and choice chords share **one namespace across the whole config**, because
choice chords fire app-wide rather than only while their field has focus. Two claimants
would be a genuine ambiguity. Pick a different chord.

### `Shortcut "mod+v" is reserved by the app or the OS.`

The chord belongs to Paste, Quit, mode switching, or another built-in. The full list is in
[Shortcuts](/config/shortcuts/#reserved-chords). A bare letter that merely appears inside a
reserved chord is fine — `"c"` is unrelated to `mod+c`.

### `e.g. "p" or "mod+s"`

The chord did not parse. It must be zero or more of `mod` `ctrl` `alt` `shift` `meta`,
each followed by `+`, then exactly one letter or digit. `"ctrl+"` has no key; `"ctrl+ab"`
has two.

## Rules

### `Give exactly one of \`value\` or \`otherField\`.`

The six comparison operators compare against a literal **or** another field, never both and
never neither.

### `Invalid regular expression.`

A `pattern` — on a text field or in a `matches` condition — is not a valid JavaScript
regex. Patterns are compiled when the config loads precisely so this surfaces here rather
than mid-labeling. The usual cause is an unescaped bracket: `"(["` should be `"\\(\\["`.

Remember JSON escaping: a regex `\d` is written `"\\d"` in a config file.

## Shape

### `Too small: expected array to have >=1 items`

An empty list where at least one entry is required — `choices` on an `enum`, `fields` on
either side, `rows` on a card, `use` on a row, `columns` on a table.

### `Invalid input: expected "text"` (or similar, on `type`)

The `type` is not one of the nine. See [Value types](/config/types/). With
`$schema` set, your editor offers the valid values in a dropdown.

### A constraint key is rejected

`minLength` on a number, `min` on text, `choices` on a boolean — constraints live on the
type that owns them. This surfaces as an unrecognised key for the type you wrote.

## Reading the output

```
/tmp/errs.jsonc:22:30 (output.fields.1.type) — Type "integer" does not match …
└── file    └ line
                └ column
                    └── dotted path to the offending key
```

The path is the fastest way in: `output.fields.1.type` is the `type` of the second field in
`output.fields`. When a cross-field check names a path with no exact source node, the
location degrades to the nearest ancestor — a roughly-right line beats none.

## Still stuck?

Set `"$schema": "https://mlabel.vlad.gg/mlabel.schema.json"` and open the config in an
editor. Most of these become a squiggle under the exact character, before you ever run the
validator.
