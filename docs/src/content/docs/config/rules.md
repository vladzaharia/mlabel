---
title: Display rules
description: Visual annotations over input values — the condition operators, the six tones, and the guarantee that rules never change output.
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

So a rule can never corrupt the data. The worst a wrong one can do is mislead a labeler —
which is not nothing, and is worth [checking for](#check-a-rule-before-you-trust-it) before
you rely on one.

## The keys

| Key              | Required | Meaning                                                                |
| ---------------- | -------- | ---------------------------------------------------------------------- |
| `name`           | **yes**  | Identifies the rule. Unique is wise; it appears in diagnostics.        |
| `when`           | **yes**  | The condition. See below.                                              |
| `appliesTo`      | no       | Which fields to style. Defaults to the field `when` tests.             |
| `appliesToCards` | no       | Which **cards** to annotate. Stated once for the whole group.          |
| `forEach`        | no       | Evaluate per element of a list. See [Per-item rules](#per-item-rules). |
| `style`          | **yes**  | `tone` and/or `note`.                                                  |

`appliesTo` matters as soon as a rule compares two fields — the default of "style the field
being tested" is right for a single-field rule and almost never right for a comparison.

## Conditions

Sixteen value operators, plus three for combining them. All read input values for the current record.

| `op`               | Compares                                           | Takes                         |
| ------------------ | -------------------------------------------------- | ----------------------------- |
| `eq`               | equal                                              | `value` **or** `otherField`   |
| `ne`               | not equal                                          | `value` **or** `otherField`   |
| `gt`               | greater than                                       | `value` **or** `otherField`   |
| `gte`              | greater than or equal                              | `value` **or** `otherField`   |
| `lt`               | less than                                          | `value` **or** `otherField`   |
| `lte`              | less than or equal                                 | `value` **or** `otherField`   |
| `in`               | is one of                                          | `value` (a non-empty list)    |
| `notIn`            | is none of                                         | `value` (a non-empty list)    |
| `matches`          | matches a regular expression                       | `pattern`                     |
| `empty`            | null, empty string, empty list                     | —                             |
| `notEmpty`         | holds anything                                     | —                             |
| `exceedsFactor`    | is more than `factor` times the other field        | `otherField` **and** `factor` |
| `fallsBelowFactor` | is less than the other field divided by `factor`   | `otherField` **and** `factor` |
| `sameDomain`       | shares an email domain with the other field        | `otherField`, `ignore`        |
| `sameLocalPart`    | shares an email local part with the other field    | `otherField`                  |
| `sharesPrefix`     | begins with the same characters as the other field | `otherField`, `length`        |
| `allOf`            | every nested condition holds                       | `conditions`                  |
| `anyOf`            | at least one nested condition holds                | `conditions`                  |
| `not`              | the nested condition does not hold                 | `condition`                   |

### Combining conditions

`allOf`, `anyOf` and `not` take conditions rather than a field, and nest to any depth:

```jsonc
{
  "op": "allOf",
  "conditions": [
    { "op": "sameLocalPart", "field": "username", "otherField": "email" },
    {
      "op": "not",
      "condition": {
        "op": "matches",
        "field": "email",
        "pattern": "@gmail\\.com$",
      },
    },
  ],
}
```

Reach for these when a signal only means something in combination. On one real dataset the
two halves above ran 92% and 92% against a 60% base rate; together they ran 98%. Emitting
them as two separate rules would have left the reader to notice they coincided.

A composing condition has no `field` of its own, so `appliesTo` defaults to **every field any
branch tests**, de-duplicated. Name `appliesTo` or `appliesToCards` explicitly when that is
not what you want.

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

### Differences of magnitude

`gt` answers "is this bigger", which is rarely the interesting question. If a column is
routinely a little above its baseline, a `gt` rule fires on almost every record and the
labeler stops reading it. `exceedsFactor` asks instead whether the difference is of a
different order:

```jsonc
{
  "name": "signup-surge",
  "when": {
    "op": "exceedsFactor",
    "field": "signupsThisHour",
    "otherField": "hourlyBaseline",
    "factor": 3,
  },
  "appliesTo": ["signupsThisHour"],
  "style": {
    "tone": "warning",
    "note": "More than three times the usual hourly rate.",
  },
}
```

`fallsBelowFactor` is the mirror: it fires when the field is below the comparand _divided_
by `factor`. Both are defined only over non-negative magnitudes — a negative value, or a
comparand of zero or less, does not fire, because a ratio against those means nothing.
A `factor` of 1 is legal and degenerates into a plain `gt` / `lt`.

### Comparing addresses

`sameDomain` and `sameLocalPart` compare two values as email addresses, ignoring case.

`sameLocalPart` treats a value with **no `@` as being entirely local part**. That is what
lets a bare username be tested against a full address:

```jsonc
{
  "name": "sender-is-account-owner",
  "when": {
    "op": "sameLocalPart",
    "field": "username",
    "otherField": "senderEmail",
  },
  "appliesTo": ["username", "senderEmail"],
  "style": {
    "tone": "warning",
    "note": "The username is the sender's own address.",
  },
}
```

Neither operator strips `+tags` or dots. That is one provider's convention rather than a
rule of the format, so it belongs in a `matches` rule you write yourself.

A domain both sides merely happen to use is not a shared domain. `ignore` names the ones too
common to mean anything, which in a real file is usually the difference between a rule that
points at something and a colour on every row:

```jsonc
{
  "op": "sameDomain",
  "field": "prev10Emails",
  "otherField": "email",
  "ignore": ["gmail.com", "hotmail.com", "yahoo.com"],
}
```

### Comparing shapes

`sharesPrefix` is true when two values begin with the same `length` characters, ignoring
case. It asks whether two identifiers **resemble each other**, which is a different question
from whether either looks odd alone:

```jsonc
{
  "name": "minted-together",
  "forEach": "prev10Usernames",
  "when": {
    "op": "sharesPrefix",
    "field": "prev10Usernames",
    "otherField": "username",
    "length": 3,
  },
  "style": { "tone": "warning", "note": "Handle begins like this account's." },
}
```

Pick `length` against your own data. Two characters match by coincidence; three or four is
usually where a shared prefix stops being an accident. A value shorter than `length` never
matches, so a rule asking for four characters is never satisfied by a two-character
agreement.

:::tip
Prefer this over a `matches` rule describing what a machine-generated identifier looks like.
A neighbouring record having an odd-looking handle says nothing about the record you are
labeling — it is the neighbour's problem, and marking it pulls attention onto a value nobody
is deciding about. That the two _resemble each other_ is the finding.
:::

## Per-item rules

A rule normally asks one question of the whole record. `forEach` asks it once per element of
a list instead, and styles the elements it held for. The named field must be an `array`.

```jsonc
{
  "name": "same-domain-as-signup",
  "forEach": "recentSignups",
  "when": { "op": "sameDomain", "field": "email", "otherField": "email" },
  "style": { "tone": "warning", "note": "Same domain as this signup." },
}
```

Both sides are spelled `email`, and they mean different things — which is the one thing to
learn about `forEach`:

- **`field` reads the element**, falling back to the record for a name the element does not
  carry. An element's own fields shadow record columns of the same name.
- **`otherField` always reads the record.**

Without that split both sides would resolve to the element and every row would match itself.
The consequence is that two _element_ fields cannot currently be compared against each
other; relating a row to its record is the case this exists for.

### Lists of scalars

A CSV cell holding several comma-joined values is read as an `array` of `text`, not of
`object`, and `forEach` works there too. A scalar element has no field names of its own, so
it answers to **the list's own name**:

```jsonc
{
  "name": "neighbour-same-domain",
  "forEach": "prev10Emails",
  "when": {
    "op": "sameDomain",
    "field": "prev10Emails",
    "otherField": "email",
  },
  "style": { "tone": "warning", "note": "Same domain as this account." },
}
```

Inside the loop `prev10Emails` is one address, and `email` is still the record's. A rule over
a scalar list must test the list's own name: a condition naming any other field is not about
the element, so it is skipped rather than evaluated — otherwise `sameDomain` on `email` vs
`email` would resolve both sides to the record and paint the whole list.

### Layering tones

Rules apply in declaration order and the last tone wins, which is how a broad rule gets a
narrower exception. Every note still shows:

```jsonc
// A shared gmail.com is the most common thing in the file and proves nothing,
// so it is declared second and takes the tone back down.
{
  "name": "neighbour-free-provider",
  "forEach": "prev10Emails",
  "when": {
    "op": "matches",
    "field": "prev10Emails",
    "pattern": "@(gmail|yahoo|hotmail)\\.",
  },
  "style": { "tone": "muted", "note": "Large free provider." },
}
```

`forEach` cannot be combined with `appliesTo` or `appliesToCards` — the target is always the
element that matched.

## Annotating a whole card

When a rule's note is about a group rather than a value, `appliesToCards` states it once on
the card instead of repeating it on every field inside:

```jsonc
{
  "name": "signup-surge",
  "when": {
    "op": "exceedsFactor",
    "field": "signupsThisHour",
    "otherField": "hourlyBaseline",
    "factor": 3,
  },
  "appliesToCards": ["velocity"],
  "style": {
    "tone": "warning",
    "note": "More than three times the usual hourly rate.",
  },
}
```

Card names live in their own namespace, separate from field names — a card may legitimately
share a name with a field — which is why this is its own key rather than more entries in
`appliesTo`.

Naming a card here **skips** the usual default of styling the field `when` tests. A rule that
should do both can give `appliesTo` as well.

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

## Check a rule before you trust it

A rule is safe for your **data** — nothing it does can reach the output file. It is not
automatically safe for your labeler's **judgement**, and that is the harder thing to protect.

A rule carries a solid border, which says: someone who understands this data decided this.
Then it fires on every matching row, identically, for as long as the config lives. Where a
model's note is drawn as a guess on purpose, a rule that was never measured is a guess wearing
the markings of a fact — and it is the confident, plausible-looking rules that do the damage,
because nobody thinks to question them.

Rules that read perfectly well and were wrong, found only by measuring:

- one marking nearly half a file as _typical_, and wrong on a tenth of those — steering the
  labeler toward the wrong answer on precisely the rows it got wrong;
- one whose threshold was off by a single character, so it missed the exact case that had
  prompted someone to write it;
- one shipped amber that fired twice, wrongly both times;
- one whose pattern could not compile, so the config loaded cleanly and the rule never fired
  at all.

None announced itself. Three looked _more_ convincing before they were checked than after.

So: write the rule, then run it against rows whose answer you already know, and keep the ones
that earn it. A hundred labelled rows is enough to catch all four of the faults above.

## Full reference

[DisplayRule](/reference/display-rule/) · [Condition](/reference/condition/) ·
[Style](/reference/style/)
