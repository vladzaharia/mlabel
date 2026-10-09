---
title: What MLabel does
description: An introduction to labeling records and working with project files.
---

MLabel is a desktop application for reviewing tabular data one record at a time. It shows
source information beside a form, then exports your answers as a new file.

A project configuration determines the columns, questions, layout, and required answers.
This lets different teams use the same app for different labeling tasks.

## A typical assignment

A customer comment is one record. MLabel shows it beside a sentiment question and optional notes. The labeler chooses an answer; the app writes the record ID and that answer into the output file. The [two-record tutorial](/admin/first-project/) lets you try this with sample data.

## Three roles

- **Labeler:** reads records and answers the project's questions. [Start labeling](/labelers/).
- **Preparer:** divides a dataset into assignments and combines returned files. [Prepare data](/preparers/).
- **Administrator:** defines the form and exported columns. [Set up a project](/admin/).

One person can do all three. No account or server is needed. Teams exchange files using
their own shared folders or delivery process; MLabel does not assign work automatically.

## What stays on your computer

Source data, labels, saved sessions, and exports stay on your computer. Update checks and
release downloads are controlled by the project configuration and your preferences.
Administrators can [disable update traffic](/config/network/).

## What you get when you finish

Select **Save** to write finished records to `*-output.csv`. Unfinished source records go
to `*-remaining.csv` if any remain. The remaining file can be assigned for another pass,
but it does not contain partially entered labels. To preserve those while taking a break,
[resume your saved session](/guide/sessions/) instead.
