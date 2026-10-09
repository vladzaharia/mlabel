---
title: Manage batches
description: Keep track of assignments, submissions, and unfinished records across a team.
---

MLabel distributes work through files. Use a batch register alongside the app to track
ownership and returns; there is no central assignment queue.

For the actual buttons and screens, see [split and join files](/guide/prepare/).

## The workflow

Source file → split into parts → assign parts → label and export → join finished outputs.
Handle remaining records separately, then assign them for another pass if needed.

## Splitting

Use Prepare mode with the tested project configuration. Choose a batch size that a labeler
can finish and return regularly. Record the input row count and keep the original dataset.
Parts contain consecutive records, with sizes differing by at most one.

### How many parts

Start with one part per person for a small project. More, smaller parts make it easier to reassign work
and see progress. Keep each part's assignment unique unless the project deliberately calls
for repeated judgments of the same records.

## While labeling is happening

Track at least:

| Batch      | Assigned to | Config version | Input rows | Output rows | Remaining rows | Status      |
| ---------- | ----------- | -------------- | ---------- | ----------- | -------------- | ----------- |
| part1-of-3 | Labeler A   | review-v1      | 100        | 80          | 20             | Returned    |
| part2-of-3 | Labeler B   | review-v1      | 100        | —           | —              | In progress |

Ask labelers to return both output and remaining files. Do not treat a remaining file as
missing work: it is the source data for the next pass. It does not preserve partial answers.

## Joining

Group outputs by configuration version and join them together in Prepare mode. Review
validation results and duplicate warnings against the batch register. Join remaining files
in a separate operation.

Use a new destination filename for each accepted delivery, and retain the individual
submissions until the combined result has been checked.

## Reassigning leftovers

Join remaining files, then split the result into new assignments. Keep a record connecting
the new batches to the earlier return. Send the matching configuration again.

## What round-trips exactly

Remaining files preserve source values, column order, and CSV dialect. Incidental file
formatting can change. See [export behavior](/guide/exporting/#what-round-trips-and-what-doesnt).

## Accept a batch only once

Mark a delivery as accepted in the register before adding it to the combined dataset. If someone sends a correction, replace the earlier delivery in your collection rather than joining both.

Check that output rows plus remaining rows account for each assignment. Use copied record
IDs and configured session fields to identify the source record and labeler in the combined
output. MLabel only exports these identifiers when the administrator includes them.

[Check returned work →](/preparers/checking-results/)
