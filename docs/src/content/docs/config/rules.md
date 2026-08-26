---
title: Display rules
description: Visual annotations over input values — the eleven condition operators, the six tones, and the guarantee that rules never change output.
---

A display rule tints an input value and attaches a note explaining why. It is how a project
author points at something worth noticing.

```jsonc
"input": {
  "fields": [ /* … */ ],
  "rules": [
    {
      "name": "canned-refusal",
      "when": { "op": "matches", "field": "response", "pattern": "^(I'm sorry|As an AI)" },
      "appliesTo": ["response"],
      "style": { "tone": "muted", "note": "Canned refusal — deprioritize." },
    },
    {
      "name": "very-confident",
      "when": { "op": "gt", "field": "score", "value": 0.9 },
      "style": { "tone": "warning", "note": "Unusually confident — check carefully." },
    },
  ],
}
```

## Rules cannot change what is exported

This is a **structural** guarantee, not a promise. Rules are evaluated by a module that
nothing on the export path imports — there is no code path from a rule to a written file.

So a rule is always safe to add. The worst a wrong one can do is mislead a labeler; it can
never corrupt the data.

## The keys

| Key         | Required | Meaning                                                         |
| ----------- | -------- | --------------------------------------------------------------- |
| `name`      | **yes**  | Identifies the rule. Unique is wise; it appears in diagnostics. |
| `when`      | **yes**  | The condition. See below.                                       |
| `appliesTo` | no       | Which fields to style. Defaults to the field `when` tests.      |
| `style`     | **yes**  | `tone` and/or `note`.                                           |

`appliesTo` matters as soon as a rule compares two fields — the default of "style the field
being tested" is right for a single-field rule and almost never right for a comparison.

## Conditions

Eleven operators, all reading input values for the current record.

| `op`       | Compares                       | Takes                       |
| ---------- | ------------------------------ | --------------------------- |
| `eq`       | equal                          | `value` **or** `otherField` |
| `ne`       | not equal                      | `value` **or** `otherField` |
| `gt`       | greater than                   | `value` **or** `otherField` |
| `gte`      | greater than or equal          | `value` **or** `otherField` |
| `lt`       | less than                      | `value` **or** `otherField` |
| `lte`      | less than or equal             | `value` **or** `otherField` |
| `in`       | is one of                      | `value` (a non-empty list)  |
| `notIn`    | is none of                     | `value` (a non-empty list)  |
| `matches`  | matches a regular expression   | `pattern`                   |
| `empty`    | null, empty string, empty list | —                           |
| `notEmpty` | holds anything                 | —                           |

### Literal or field, never both

The six comparison operators take **exactly one** of `value` and `otherField`:

```jsonc
{ "op": "gt", "field": "score", "value": 0.9 }             // ✓ against a literal
{ "op": "gt", "field": "score", "otherField": "threshold" } // ✓ against another column
{ "op": "gt", "field": "score" }                            // ✗ give exactly one
{ "op": "gt", "field": "score", "value": 0.9, "otherField": "threshold" } // ✗
```

Comparing two fields is what `appliesTo` is for:

```jsonc
{
  "name": "below-threshold",
  "when": { "op": "lt", "field": "score", "otherField": "threshold" },
  "appliesTo": ["score", "threshold"],
  "style": { "tone": "danger", "note": "Below the configured threshold." },
}
```

### Ordering only works on numbers and dates

`gt` / `gte` / `lt` / `lte` need both sides to be comparable numbers; dates compare by
instant. A comparison that cannot be ordered simply **does not fire** — it is never an
error at runtime.

### Rules never throw

A rule pointing at a missing value, or a wrongly-typed one, quietly does not fire. A
malformed rule should leave the data looking ordinary, not break the screen the labeler is
trying to read.

The one thing checked up front is the regex: `pattern` is compiled when the config loads, so
a bad one is a config error rather than a silent no-op.

## Tones

| Tone      | Reads as                            |
| --------- | ----------------------------------- |
| `muted`   | Deprioritize this                   |
| `info`    | Context worth knowing               |
| `success` | A positive signal                   |
| `warning` | Look carefully                      |
| `danger`  | Something is wrong here             |
| `accent`  | Draw the eye, no judgement attached |

Tones are semantic, not colours. Each maps to a contrast-audited token pair, and a CI gate
keeps every one of them legible in both themes — which is exactly why the vocabulary is
closed rather than accepting arbitrary hex.

## Several rules on one field

Rules apply in declaration order and a field may collect several. The **last tone wins**;
**every note is shown**.

## Rules are hints, not instructions

A rule note looks different from a validation error on purpose. A validation error is
something the labeler is expected to fix. A rule is about the source data, which they
cannot fix and may reasonably disagree with.

Write notes accordingly: "Unusually confident — check carefully" invites judgement.
"This is wrong" pre-empts it, and biases your own dataset.

## Full reference

[DisplayRule](/reference/display-rule/) · [Condition](/reference/condition/) ·
[Style](/reference/style/)
