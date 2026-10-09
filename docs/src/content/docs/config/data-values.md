---
title: How source cells are read
description: Understand blank values, date formats, and structured values inside CSV cells.
---

CSV cells begin as text. MLabel reads each value using the input field’s declared type.

## Accepted values

CSV cells are strings. Each is coerced according to its declared type when the file loads.

| Type               | Accepts                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| `text`             | Anything; non-strings are stringified.                                           |
| `number`           | Anything `Number()` parses, after trimming.                                      |
| `integer`          | The same, but rejects a fractional result.                                       |
| `boolean`          | `true` `false` `1` `0` `yes` `no` `y` `n`, case-insensitive.                     |
| `date`             | ISO-8601 and a range of everyday formats. See [Dates](#dates).                   |
| `enum`             | Must be exactly one of the choice names.                                         |
| composite          | A JSON string at the top level, then recursively coerced.                        |
| `array` of scalars | JSON first; failing that, a stringy list. See [Lists](#lists-that-are-not-json). |

**An empty cell becomes `null`**, for every type. Empty is not zero, not `false`, and not
an empty list — it is the absence of a value, which is what makes required-ness meaningful.

A cell that will not coerce does not refuse the file. The value shows as empty with a
warning icon you can hover or focus for the reason, and the labeler carries on — they cannot
fix the source data, so it is information rather than a task. See
[Troubleshooting](/guide/troubleshooting/).

### Dates

MLabel reads more than `new Date()` does, to support common source formats:

| Written as                       | Read as                                             |
| -------------------------------- | --------------------------------------------------- |
| `2026-05-01`, `2026/05/01`       | that calendar day                                   |
| `20260501`                       | that calendar day                                   |
| `01/05/2026`                     | **5 January** — month first                         |
| `25/12/2026`                     | 25 December — day first, since 25 cannot be a month |
| `2026-05-01 14:30`, `…T14:30:00` | that date and time                                  |
| `…T14:30:00Z`, `…+02:00`         | that instant, in the zone given                     |
| `1767225600` / `1767225600000`   | Unix seconds / milliseconds                         |

An all-numeric date with both parts under 13 is **month-first**, matching what JavaScript
has always done with `01/05/2026`. Use ISO dates such as `2026-05-01` to avoid that ambiguity.

**Everything is read and displayed as UTC, including values that name no zone.** A value
that names no zone has not told MLabel one, and adopting the labeler's would mean two people
in two countries exporting different bytes for the same input file.

A date with no time of day displays as a date; one carrying a time displays with it. MLabel
knows which by looking at the value, so a source that says exactly `2026-05-01T00:00:00Z` is
indistinguishable from one that says `2026-05-01`, and displays as a plain date.

### Lists that are not JSON

An `array` of scalars accepts JSON first. If that fails, MLabel falls back to reading the
cell as a stringy list: it strips one matched layer of `[]`, `()` or `{}`, splits on commas,
semicolons, pipes or newlines, and unquotes each item.

```
a, b, c          →  ["a", "b", "c"]
[1; 2]           →  [1, 2]
'red', green     →  ["red", "green"]
```

Valid JSON always wins, so `["a, b"]` stays a single item. Use JSON when you control the source format; it preserves embedded separators unambiguously.

It applies **only to lists of scalars**. For an `array` of `object`, a `map` or an `object`,
splitting on commas would quietly mis-assign data rather than fail, so those stay strict JSON
and a malformed cell is reported.

One consequence worth knowing: a column read this way and carried into the output with
`fill: copy` is written back as JSON. `*-output.*` has never promised byte-for-byte fidelity,
but `a, b` in becomes `["a","b"]` out.
