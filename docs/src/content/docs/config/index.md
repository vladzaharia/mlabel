---
title: Understand the configuration file
description: Find the right setting without reading the whole schema.
---

A project configuration is a `.jsonc` file. It defines the source columns, questions, exported values, and screen layout. JSONC permits comments and trailing commas.

If you want a working starting point, use the [first-project tutorial](/admin/first-project/) or an [illustrated recipe](/config/cookbook/). This page is a map of the file, not a prerequisite for labeling.

## The smallest working config

```jsonc
{
  "$schema": "https://mlabel.vlad.gg/mlabel.schema.json",
  "version": 2,
  "network": { "updateChecks": false },
  "input": { "fields": [{ "name": "comment", "type": "text" }] },
  "output": {
    "fields": [
      {
        "name": "decision",
        "type": "enum",
        "widget": "radio",
        "choices": [{ "name": "pass" }, { "name": "fail" }],
      },
    ],
  },
}
```

This reads a source file with a `comment` column and asks for one decision per record. The answer is required by default. The example also disables update traffic.

## Top level

| Setting                       | Purpose                                               | Guide                                                   |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `$schema`                     | Editor autocomplete and structural validation         | [Check your work](#check-your-work)                     |
| `version`                     | Configuration format; use `2`                         | [Compatibility](/config/versioning/)                    |
| `input.fields`                | Source columns and how to read them                   | [Fields](/config/fields/)                               |
| `output.fields`               | Exported columns, including entered and copied values | [Value sources](/config/fill/)                          |
| `input.cards`, `output.cards` | Screen grouping and ordering                          | [Cards](/config/cards/)                                 |
| `input.rules`                 | Visual hints over source values                       | [Display rules](/config/rules/)                         |
| `ui`                          | App title                                             | [Captions and title](/config/display/#the-window-title) |
| `network`                     | Permission for update traffic                         | [Network policy](/config/network/)                      |

`input` and `output` can also set `adapterId` and `adapterConfig` for file handling. CSV is the default. [File-format options](/config/adapters/).

## The two rules

### Use supported settings

Unknown keys are rejected, so a misspelling does not silently change your project's behavior. `adapterConfig` is the exception: its supported options belong to the file adapter, and unknown keys may be ignored.

### Separate the three field decisions

- **Type:** what the value means, such as text, a number, or a choice.
- **Fill:** where an output value comes from, such as a labeler or source column.
- **Widget:** the control used when a person provides it.

A matching input and output name does not automatically copy a value. Set `fill.kind: "copy"` when that is what you intend.

## Growing the example

Add one behavior at a time and check the result:

1. [Choose answer controls visually](/config/widgets/).
2. [Carry an ID into output](/config/recipes/rename-column/).
3. [Ask once for reviewer details](/config/recipes/audit-trail/).
4. [Arrange cards](/config/cards/) and [add helpful captions](/config/display/).
5. [Highlight a source comparison](/config/recipes/highlight-input/).

Each example supplies a runnable configuration and sample data, so you can compare its screen and exported values before adapting it.

## Check your work

Open the config in MLabel. If it loads, try representative source records and export a small result. Check required answers, blank values, column order, and the exact stored choice names.

In a repository checkout with development dependencies installed, you can also run:

```bash
pnpm validate path/to/config.jsonc
```

Fix errors and rerun until it succeeds. Syntax, structure, and relationships between fields are checked in stages.

The `$schema` URL helps your editor find structural errors; it cannot express every relationship the app checks. A config that passes editor validation may still be rejected by MLabel. [Understand validation errors](/config/errors/).

[Complete key reference →](/reference/)
