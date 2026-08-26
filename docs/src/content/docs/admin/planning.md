---
title: Planning a labeling project
description: Designing an output schema, deciding required-ness, budgeting shortcuts, and piloting before you commit.
sidebar:
  order: 1
---

The config is the project design. Most of what makes a labeling run go well or badly is
decided before anyone labels anything.

## Start from the output

Work backwards from the file you want at the end. Write out the columns of the finished
dataset, then ask of each one: who provides this?

| Provided by                         | Fill        |
| ----------------------------------- | ----------- |
| The labeler, per record             | `user`      |
| The labeler, once for the whole run | `session`   |
| The source data                     | `copy`      |
| The app                             | `timestamp` |

Doing this first stops the two most common design mistakes: asking a labeler for something
that was already in the input, and forgetting to carry the join key through so the labels
cannot be matched back to the source.

**Always copy a stable identifier.** Without one, `*-output` is a set of judgements with
nothing to attach them to.

## Choosing types

Pick the type that makes wrong answers **unrepresentable**:

- A fixed vocabulary is an `enum`, never `text`. Free text collects `pass`, `Pass`, `passed`
  and `p` in the same column, and cleaning that up afterwards is worse than the labeling.
- A bounded score is an `integer` with `min`/`max`, not `number`.
- "Which of these apply" is an `array` of `enum`, not a comma-separated `text` field.

If you find yourself planning to normalize a column afterwards, the type is wrong.

## Required-ness

The defaults are right more often than not: things a person is asked for are required,
things the app derives are not. Override deliberately.

Every required field is a field that can block a record from exporting. A record missing one
required value goes to `*-remaining` in its entirety, including the answers the labeler _did_
give — those are preserved in the session, but they are not in `*-output`.

So: make optional anything you would rather have partially than not at all. Notes boxes and
secondary judgements are almost always `required: false`.

## Session versus per-record

Ask per record only what genuinely varies per record.

`session` fields cost the labeler one answer for the entire run, and give you provenance on
every row: who labeled it, against which guideline version, in which batch. That is usually
what you want for anything you would otherwise be tempted to put in the filename.

Remember that session fields need a `scope: "session"` card, or they leave a hole in the
per-record grid.

## Designing for speed

Throughput is dominated by how many interactions each record takes.

- **One primary question, answerable with a digit.** <kbd>1</kbd>–<kbd>9</kbd> works with no
  configuration, and <kbd>Enter</kbd> advances. Two keystrokes per record is achievable.
- **`radio` rather than `select`** for two to five options — every option visible, one click.
- **Keep the form shorter than the screen.** If the labeler scrolls on every record, you
  have added a scroll to every record.
- **Put the subject full-width at the top** with `titlePosition: "above"`.

## Budgeting shortcuts

Chords share one namespace across the whole config, and a set of them is a small language
your labelers have to learn. Spend them carefully:

1. **Digits are free.** They already pick the *n*th choice of the focused choice field.
2. **Mnemonic letters for a second choice field** — `c`/`x` for correct/incorrect. These
   survive someone reordering the choices; digits do not.
3. **`mod+` chords for fields**, because they keep working from inside a text box.

Do not shortcut everything. A config with fifteen chords has none that anyone remembers.

## Guidance belongs in the config

Anything you would otherwise put in a separate instructions document is better in `help`,
where it sits beside the question it concerns:

```jsonc
"display": {
  "title": "Verdict",
  "description": "Is the response factually correct?",
  "help": "Judge only factual accuracy. Tone, length and style are covered by other fields. If the claim cannot be checked from the prompt alone, choose Unclear.",
}
```

`description` is always visible — use it for what applies every time. `help` is behind a
click — use it for edge cases. A guideline doc nobody has open during labeling is a
guideline doc nobody follows.

## Pilot before you commit

Always, and on real data.

1. Take **20 rows** of the actual file, not a synthetic sample.
2. Run `pnpm validate` on the config.
3. Label all 20 yourself, end to end, including pressing **Done**.
4. Open `*-output` and check it is the file you wanted — column order, value spellings,
   date format, the timestamp.

This catches, cheaply, the things that are expensive later: a type that does not match the
data, a required field that makes half the records unexportable, an `enum` missing the
option that turns out to apply to a third of the rows, a form that takes 40 seconds per
record.

**Rerun the pilot after any config change**, and re-label a couple of records. A schema
change can silently alter what a value means on the way back in.

## Changing a config mid-project

Avoid it. If you must:

- **Adding an optional field** is the safe case. Already-exported files simply lack the
  column.
- **Adding a required field** invalidates every record already labeled — they now fail
  completeness.
- **Renaming or retyping** a field breaks the join between old and new outputs, and
  invalidates saved sessions.

Sessions are keyed to config _path_ and input path, and the config's content is not part of
the key. Editing a config in place while someone is mid-run means their saved labels are
restored against a schema that has changed underneath them. If you must change one during a
run, ask labelers to export first.

## Next

- [Distributing work](/admin/distributing/) — splitting across labelers and joining back.
- [Deploying to labelers](/admin/deploying/) — shipping the app and config together.
- [Cookbook](/config/cookbook/) — recipes for the shapes above.
