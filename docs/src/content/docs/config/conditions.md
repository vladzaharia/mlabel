---
title: Rule conditions and list items
description: Compare input values, combine conditions, and highlight individual list items.
---

Start with [the illustrated rule guide](/config/rules/) for a complete example. This page is the detailed condition reference.

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

Use a combined condition when several facts need to hold at the same time. Separate rules would each fire independently.

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
