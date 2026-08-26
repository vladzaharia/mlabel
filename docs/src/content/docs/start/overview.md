---
title: What MLabel is
description: A local-only desktop app for manual data labeling, where a single .jsonc config decides everything you see and everything you capture.
sidebar:
  order: 1
---

MLabel is a desktop app for labeling tabular data by hand. You give it two things — a
**config** and a **data file** — and it shows you one record at a time with a form beside
it. When you are done it writes your labels out as a new file.

## The one idea

Nothing about the data is hard-coded. There is no built-in notion of a "sentiment column"
or a "quality rating". A single `.jsonc` config file declares:

- which columns to read and how to display them,
- what to capture and with which widgets,
- how it is all laid out,
- what counts as a finished record,
- which keys are shortcuts.

Change the config and you have a different labeling tool. No rebuild, no code.

## What it is not

MLabel does not manage a labeling _workforce_. There is no server, no queue, no accounts,
no inter-rater agreement dashboard. It labels a file. Distributing work across people is
done by [splitting a file into parts](/admin/distributing/) and joining the results back
together.

It is also not a spreadsheet. You see one record at a time, in a layout designed for
reading, because the thing it is optimized for is the quality of a human judgement rather
than throughput of bulk edits.

## Local by construction

Everything runs on your machine. The only remote request MLabel is capable of making is
its own update check against GitHub Releases, and:

- it is refused outright at the network layer unless a loaded config permits it,
- `"network": { "updateChecks": false }` in your config disables even that,
- the window itself can never make a network request, in any configuration.

Nothing you load, label, or export is transmitted anywhere. See
[Network policy](/config/network/) for exactly what is allowed and what is denied.

## What comes out

When you press **Done**, MLabel writes two files next to your input:

| File            | Contents                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `*-output.*`    | Every record whose required fields are filled and valid, in output schema. |
| `*-remaining.*` | Every record that is unfinished, re-emitted in the _input_ schema.         |

The remaining file is deliberately loadable again as input, so a long job can be picked up
later — or handed to someone else. See [Exporting](/guide/exporting/).

## Next

- [Download](/start/download/) the build for your platform.
- Learn the [vocabulary](/start/concepts/) — field, fill, card, session.
- Or jump straight to [writing a config](/config/).
