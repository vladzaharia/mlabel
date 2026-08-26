---
title: Display and captions
description: Titles, descriptions, help popovers, caption placement and text size — plus the string shorthand.
---

`display` controls what a labeler reads. It never affects what is captured or exported.

## The shorthand

Most display blocks only carry a title, so a bare string means exactly that:

```jsonc
{ "name": "score", "type": "number", "display": "Model score" }
// identical to
{ "name": "score", "type": "number", "display": { "title": "Model score" } }
```

The shorthand is expanded before validation, so nothing downstream ever sees two shapes.
Use it freely.

## The keys

| Key             | Applies to      | Effect                                         |
| --------------- | --------------- | ---------------------------------------------- |
| `title`         | everything      | The caption, in place of the machine name.     |
| `description`   | everything      | A line under the caption.                      |
| `help`          | everything      | Longer text in a ⓘ popover beside the caption. |
| `titlePosition` | **fields only** | `left` (default) or `above`.                   |
| `textSize`      | **fields only** | `sm`, `md` (default) or `lg`.                  |

```jsonc
{
  "name": "score",
  "type": "number",
  "display": {
    "title": "Model score",
    "description": "Reported by the upstream model.",
    "help": "Values above 0.9 are unusual and worth a second look.",
  },
}
```

Choices, cards and table columns take only the first three. A `textSize` on a choice would
mean nothing, so it is rejected rather than silently ignored — the same strictness as
everywhere else in the config.

## Layout for long values

The default caption placement puts the label to the left of the value, which works for
short things. A long prompt or a model response needs the full width:

```jsonc
{
  "name": "response",
  "type": "text",
  "display": { "title": "Model response", "titlePosition": "above", "textSize": "lg" },
}
```

Rule of thumb: `titlePosition: "above"` for anything longer than a few words, and `lg` for
the one or two fields that are the actual subject of the judgement.

## Description or help?

- **`description`** is always visible. Use it for something every labeler needs every time.
- **`help`** is behind a click. Use it for the edge cases and the "what do I do if…"
  guidance that would otherwise be noise.

Putting the full annotation guideline in a `description` makes the screen unreadable by the
tenth record. `help` is where that belongs.

## Styling a selected choice

`selectedStyle` tints a choice's widget while it is the selected one:

```jsonc
"choices": [
  { "name": "pass", "display": "Pass" },
  { "name": "fail", "display": "Fail", "selectedStyle": { "tone": "danger" } },
]
```

Use it sparingly and semantically — to mark a consequential answer, not to decorate. The
six tones are listed under [Display rules](/config/rules/#tones); each maps to a
contrast-audited pair rather than a fixed colour, so both light and dark themes stay
legible.

## The window title

```jsonc
"ui": { "appTitle": "Toxicity review" }              // fixed
"ui": { "appTitle": { "field": "id" } }              // tracks the current record
```

The field form is worth it when several MLabel windows are open, or when you need to quote
a record ID to someone.

## Full reference

[TextDisplay](/reference/text-display/) · [FieldDisplay](/reference/field-display/) ·
[Style](/reference/style/)
