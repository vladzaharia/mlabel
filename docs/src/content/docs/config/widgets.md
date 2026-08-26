---
title: Widgets
description: Which widget each type can use, which is the default, and why the pairing is enforced structurally.
---

A widget is **how a field renders**. It is independent of the type and of the fill.

Most fields never name one — each type has a default that is right most of the time.

## The matrix

| Type      | Legal widgets      | Default      |
| --------- | ------------------ | ------------ |
| `text`    | `text`, `textarea` | `text`       |
| `integer` | `number`, `slider` | `number`     |
| `number`  | `number`, `slider` | `number`     |
| `boolean` | `checkbox`         | `checkbox`   |
| `date`    | `date`             | `date`       |
| `enum`    | `select`, `radio`  | `select`     |
| `array`   | `checkboxes`       | `checkboxes` |
| `object`  | _none_             | —            |
| `map`     | _none_             | —            |

The first entry is always the default.

## Choosing one

```jsonc
// Long free text.
{ "name": "notes", "type": "text", "widget": "textarea" },

// A bounded rating reads better as a slider.
{ "name": "rating", "type": "integer", "widget": "slider", "min": 1, "max": 5, "step": 1 },

// Three options, always visible, one click each.
{ "name": "sentiment", "type": "enum", "widget": "radio", "choices": [ /* … */ ] },
```

Rules of thumb:

- **`radio` over `select`** when there are two to five options and speed matters — every
  option is visible and one click away. `select` earns its place past about seven.
- **`slider` over `number`** only when the range is small and bounded, and the exact value
  matters less than the rough position. Give it `min`, `max` and `step`.
- **`textarea` over `text`** whenever a sentence is expected rather than a phrase.

## Mismatches are structural errors

The legal widgets are declared per type in the schema itself, not checked by hand
afterwards. So this is caught the same way a misspelled key is — including by your editor,
as you type:

```jsonc
{ "name": "notes", "type": "text", "widget": "slider" }
// ✗ Unrecognized key / invalid value: "slider" is not a widget a text field can use.
```

## Composite types render no widget

`object` and `map` have no legal widgets at all. There is no sensible control for capturing
an arbitrary nested structure, so an output field of either type must declare a
[`fill`](/config/fill/) that does not involve asking a person:

```jsonc
{
  "name": "meta",
  "type": "object",
  "fields": [
    /* … */
  ],
}
// ✗ "object" fields cannot be filled by a user; give the field a `fill`.
```

They display perfectly well on the **input** side, as tables — see
[Value types](/config/types/#object).

## Derived fields render nothing

A `copy` or `timestamp` field is filled without asking, so it has no widget regardless of
type. Naming one is an error:

```jsonc
{ "name": "id", "type": "text", "fill": { "kind": "copy" }, "widget": "text" }
// ✗ A "copy" field renders no widget.
```

## Multi-select

`checkboxes` is the widget for an `array` of `enum`:

```jsonc
{
  "name": "issues",
  "type": "array",
  "items": {
    "type": "enum",
    "choices": [
      { "name": "toxic", "shortcut": "t" },
      { "name": "off-topic", "shortcut": "o" },
    ],
  },
}
```

Choice shortcuts **toggle** rather than replace, which is what you want when several answers
can apply at once.

## Full reference

[OutputField](/reference/output-field/) — the `widget` key on each type variant.
