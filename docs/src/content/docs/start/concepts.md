---
title: Words used in these guides
description: A plain-language glossary of records, fields, schemas, configurations, and sessions.
---

You do not need to memorize these terms before labeling. Use this page when you meet an
unfamiliar word in the app or a guide.

| Term                   | Meaning                                                 | Example                                    |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------ |
| Record                 | One row of source data; one item to label               | A customer comment                         |
| Field                  | One piece of information or one answer                  | Comment text, sentiment, notes             |
| Input                  | The source data you read                                | `review.csv`                               |
| Output                 | The finished records and captured values                | `review-output.csv`                        |
| Configuration (config) | The `.jsonc` file defining a project                    | Which questions to ask                     |
| Schema                 | The definition of a dataset's fields, types, and rules  | Sentiment must be one of three choices     |
| Type                   | The kind of value a field holds                         | Text, a number, a date                     |
| Widget                 | The on-screen control used to enter an answer           | Radio buttons, a dropdown, a text box      |
| Card                   | A group of displayed fields under a heading             | Customer details                           |
| Fill                   | Where an output value comes from                        | A labeler, the source file, or a timestamp |
| Display rule           | A project-defined condition that highlights information | A warning beside an unusual score          |

## Two uses of “schema”

A **project schema** describes your data and answer fields. The published **JSON Schema** describes which settings are allowed in the configuration file; editors use it for autocomplete and checks.

## Two uses of “session”

A **saved session** remembers your current file, position, and answers so you can resume.
MLabel keeps one saved session at a time.

A **session field** is a question answered once for the whole run, such as your name or the
guideline version. Its answer is included on every finished output row.

## Complete, partial, and unlabeled

A complete record has the required valid answers. A partial record has been started but is
not complete. An unlabeled record has not been started. Only complete records go to the
finished output; see [labeling](/guide/labeling/#what-complete-means).
