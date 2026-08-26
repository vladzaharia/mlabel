---
title: Concepts
description: The vocabulary — input, output, field, fill, widget, card, record, session — and how the pieces relate.
sidebar:
  order: 8
---

Eight words carry most of MLabel. Learning them makes both the app and the config file
read easily.

## Input and output

A config has two halves.

**Input** is what MLabel _reads and shows you_. It declares the columns of your source
file and how each should be displayed. You never edit input — it is the evidence.

**Output** is what MLabel _writes_. It declares the columns of the exported file: what you
are asked to record, plus anything carried over or stamped automatically.

They are deliberately separate. An output column may share a name with an input column, or
not; the connection between them is always stated explicitly rather than inferred.

## Field

One column, on either side. A field **is** its type:

```jsonc
{ "name": "score", "type": "number", "min": 0, "max": 1 }
```

The `type` decides which other keys are legal. `minLength` only exists on `text`; `min`
only on numbers; `choices` only on `enum`. There are [nine types](/config/types/).

## Fill

Only on output fields: **where the value comes from**.

| Fill        | Who provides it                                      |
| ----------- | ---------------------------------------------------- |
| `user`      | You, on every record. The default.                   |
| `session`   | You, once at the start; copied onto every row.       |
| `copy`      | Carried over from an input column.                   |
| `timestamp` | Stamped by the app when the record becomes complete. |

Fill is independent of type and of widget. See [Fill](/config/fill/).

## Widget

**How** a field is rendered — a slider or a number box, radio buttons or a dropdown. Each
type has a small set of legal widgets and a sensible default, so most fields never name
one. See [Widgets](/config/widgets/).

Fill and widget are orthogonal: fill says _who answers_, widget says _what it looks like_.
A field nobody answers (`copy`, `timestamp`) renders no widget at all.

## Card

A group of fields under a heading, arranged in rows. Cards are how a screen full of columns
becomes something readable — "Sample" here, "Automated signals" there. Omit them and you
get one card with every field, one per row. See [Cards](/config/cards/).

## Record

One row of your data file, and one screenful of work. A record is **complete** when every
required output field holds a valid value, **partial** when you have answered some of it,
and **unlabeled** when you have not touched it. Only complete records are exported to
`*-output`.

## Session

The answers you give once at the start, before labeling begins — the values of every
`session`-filled field. They are written onto every exported row. Use them for facts about
the _run_ rather than the record: who is labeling, which guideline version, which batch.

## Display rule

A purely visual annotation on input values: tint this red, add a note saying why. Rules can
flag a suspicious value or a canned refusal so it catches your eye.

Rules **can never change what is exported**. That is a structural guarantee in how MLabel
is built, not a promise — the code that evaluates rules is never reachable from the code
that writes files. See [Display rules](/config/rules/).

## Putting it together

```
CSV row ──▶ input fields (typed, displayed) ──▶ you read it
                                                    │
                        session answers ─────┐      ▼
                        copied values ───────┼──▶ output fields ──▶ *-output.csv
                        timestamp ───────────┘                      *-remaining.csv
```

Ready to write one? [Anatomy of a config](/config/) →
