---
title: Versioning
description: Why `version` is required, what the two rejection messages mean, and how to bring a v1 config forward.
---

Every config must declare its format version:

```jsonc
{ "version": 2 /* … */ }
```

This build reads **version 2 only**.

## Why it is checked first

The version gate runs before any other validation, and that ordering is the whole point.

A v1 config measured against the v2 schema produces nine errors — one real cause ("this is
the old shape") buried under eight consequences. One clear sentence beats nine accurate
ones, so the gate short-circuits everything else.

## The two messages

**No `version` key:**

> This config has no `version`. MLabel 0.3 and later require `"version": 2` and a rewritten
> schema.

**A version this build does not read:**

> Unsupported config version 1. This build reads version 2.

Both mean the same thing in practice: the file needs bringing forward.

## Coming from v1

v2 was a rewrite rather than an increment. The changes that matter:

| v1                                        | v2                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `control: "radio"` etc. on a field        | `type` plus an optional `widget` — see [Widgets](/config/widgets/) |
| `control: "hidden"`                       | `fill: { "kind": "copy" }` — see [Fill](/config/fill/)             |
| Output name matching an input name ⇒ copy | Stated explicitly with `fill`                                      |
| Constraints on any field                  | Constraints live on the type that owns them                        |
| Unknown keys ignored                      | Unknown keys are errors                                            |

The biggest conceptual shift is that **a field is a type**. In v1 the control both rendered
the field and implied its data; in v2 `type` says what the value _is_, `widget` says how it
looks, and `fill` says who provides it — three independent decisions.

The most common migration surprise is the implicit copy. A v1 output field whose name
matched an input column was copied automatically; in v2 nothing is inferred, so that field
needs `"fill": { "kind": "copy" }` or it becomes a question the labeler is asked.

### How to migrate

There is no automatic converter. For a config of any size the fastest route is to rewrite it
against the schema with an editor doing the work:

1. Start a new file with `"$schema": "https://mlabel.vlad.gg/mlabel.schema.json"` and
   `"version": 2`.
2. Move the input fields across, giving each a `type`.
3. Move the output fields across, deciding for each one: what is its type, who fills it,
   which widget.
4. Run `pnpm validate` and fix what it reports.

With the `$schema` set, your editor offers only the keys legal for the type you have
written, which makes step 3 mostly mechanical.

## Sessions are versioned too

The saved labeling session carries its own separate version. A session written by a
different build is discarded rather than trusted — it holds typed values whose meaning
depends on the schema, and a mismatched read is worse than starting fresh. See
[Sessions](/guide/sessions/).

## What a future v3 would mean

Version is a literal, and both directions are refused: this build reads `2`, not "2 or
later". A newer config in an older build fails cleanly rather than being partially
understood.

The schema is designed so ordinary growth does **not** need a version bump — the condition
vocabulary is a discriminated union precisely so composition operators can be added without
breaking existing configs. A bump means a genuine reinterpretation of something that already
had a meaning.
