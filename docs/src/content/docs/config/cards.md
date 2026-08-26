---
title: Cards and layout
description: Grouping fields into cards and rows, controlling wrapping, and the session scope.
---

Cards turn a list of columns into something readable. They work identically on both sides
of the config.

## Omit them entirely

```jsonc
"input": { "fields": [ /* … */ ] }
```

With no `cards`, MLabel renders one implicit card holding every field, one per row. For a
config with three or four fields that is exactly right, and six lines of layout describing
the only possible arrangement would be noise.

## Declaring them

```jsonc
"cards": [
  {
    "name": "sample",
    "display": { "title": "Sample", "description": "The prompt/response pair under review." },
    "rows": [
      { "use": ["prompt"] },
      { "use": ["response"] },
      { "perRow": 3, "use": ["model", "created", "score"] },
    ],
  },
  {
    "name": "signals",
    "display": "Automated signals",
    "rows": [{ "perRow": 2, "use": ["flagged", "tags"] }, { "use": ["checks"] }],
  },
]
```

- **`name`** identifies the card and must be unique within its side.
- **`display`** takes `title`, `description` and `help` — see [Display](/config/display/).
- **`rows`** is a list, rendered top to bottom.
- **`use`** names the fields in that row, in order. Every name must be a declared field on
  the same side, or the config is rejected.
- **`perRow`** is how many columns to fit before wrapping. It defaults to the number of
  fields in the row.

## `perRow`

`perRow` is a target, not a hard cap — the layout still wraps on a narrow window. Setting it
lower than the number of fields is how you get a deliberate grid:

```jsonc
{ "perRow": 2, "use": ["a", "b", "c", "d"] }   // two rows of two
{ "use": ["a", "b", "c", "d"] }                // one row of four, wrapping as needed
```

## Fields you leave out

A field that no card names is simply not displayed. That is a legitimate way to declare a
column so it can be [copied](/config/fill/) to the output without cluttering the screen —
but it is also an easy accident. If a field seems to be missing from the UI, check whether
any card lists it.

## Session cards

An output card can render on the **setup screen** instead of once per record:

```jsonc
"cards": [
  {
    "name": "run",
    "scope": "session",
    "display": { "title": "About this run", "description": "Asked once, applied to every row." },
    "rows": [{ "perRow": 2, "use": ["annotator", "guidelineVersion"] }],
  },
  {
    "name": "labels",
    "display": "Labels",
    "rows": [{ "use": ["verdict"] }],
  },
]
```

`scope` defaults to `record`.

:::caution
Put [session-filled fields](/config/fill/#session) in a `session` card. Listing one in a
`record` card leaves a hole in the per-record grid, because the field is not rendered
there.
:::

## Ordering

Cards render in declaration order, rows within a card in declaration order, fields within a
row in `use` order. Layout is entirely positional — there is no sorting or auto-placement to
reason about.

## Laying out for reading

A few things that consistently help:

- **Put the subject first, alone, full width.** The thing being judged deserves its own row
  with `titlePosition: "above"`.
- **Group metadata.** Three short scalars in one row with `perRow: 3` reads as a header
  strip rather than three separate facts.
- **Separate provenance from evidence.** "What the model said" and "what upstream tooling
  computed" are different kinds of information; different cards make that obvious.
- **Keep the output form short.** If the form does not fit on screen beside the record, the
  labeler is scrolling on every single item.

## Full reference

[Card](/reference/card/) · [CardRow](/reference/card-row/)
