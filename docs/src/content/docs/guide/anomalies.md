---
title: Anomaly detection
description: An optional local model that reads each record ahead of you and points out what looks off — what it is, what it costs, and why its suggestions never reach your output file.
---

MLabel can run a small language model **entirely on your own machine** to read each record
before you get to it and point out anything that looks internally inconsistent — a username
that is really an email address, a date that contradicts its neighbours, a value that does
not belong in its column.

It is off until you turn it on, and a project's config can remove it altogether.

## What it is not

It is **not** a labeler. Nothing it says is written to your output file, and there is no
button that turns a suggestion into an answer. That is a structural guarantee, not a
promise: the code that produces findings is not reachable from the code that writes files,
the same way display rules are kept apart.

It is also **not reliable**. A model this size is right some of the time, which is a
different thing from being right. Treat a note as a reason to look, never as a reason to
decide — check each one against the record in front of you.

:::note
Where a deterministic [display rule](/config/rules/) can express the thing you are looking
for, write the rule. A rule fires on exactly the rows that match it, every time, and says so
in a colour you chose. The model is for the shapes you cannot write down in advance.
:::

:::caution
Because it sits beside the answer, a wrong suggestion can quietly pull your judgement
toward it. If a task is one where that matters more than the help is worth, set
`ai.anomalyDetection` to `false` in the config and the feature disappears for everyone
working on it.
:::

## Turning it on

**Settings → Anomalies** (<kbd>⌘/Ctrl</kbd>+<kbd>,</kbd>). Switch it on, then download a
model. Two are offered:

| Model      | Download | Notes                                                     |
| ---------- | -------- | --------------------------------------------------------- |
| Qwen3.5 2B | 1.28 GB  | Newer, better judgement, a little slower                  |
| Qwen3 1.7B | 1.11 GB  | Smaller and faster, on a very well-supported architecture |

Both are Apache-2.0 and are fetched from Hugging Face over a single verified download. The
file's checksum is pinned in the app, so a changed upload fails rather than runs.

The download resumes if interrupted, and can be cancelled. Delete a model any time from the
same screen.

## Where the notes appear

- **Beside the value**, for a note about one column.
- **Across the top of a card**, for a note about a group.
- **Under the answers**, in a "Model notes" panel — which also carries notes about the row
  as a whole, since those have nowhere else to sit.

Model notes are drawn differently from the display rules your config author wrote: a dashed
rail rather than a solid one, and a small ✦ marker. A rule is something someone who knows
the data decided; a note is a guess. Where both apply to the same field, both are shown and
the authored one keeps its colour.

## What it costs

- **A gigabyte-plus download**, once.
- **About 3 GB of memory** while the model is loaded. It unloads after five minutes idle and
  reloads when you next need it.
- **A few seconds per record.** MLabel works ahead of you — it analyses the record you are
  on plus the next few — so in steady reading the answer is usually there before you are. On
  a machine with no usable GPU the first record after a pause will make you wait.

## Seeing what was actually asked

**Settings → Anomalies → Recent runs** lists every time the model was run this session: which
record, what came back, and how long it took. Click a row for the whole exchange — the record
as the model saw it, the instructions it was given, and the raw reply before any parsing.

This is the counterpart to the [network log](/guide/settings/#network), and it is there for
the same reason. Being told to verify a suggestion is only actionable if you can see what
produced it, and the two things that most often mislead this feature are both invisible from
the note alone: a long value **truncated out of the prompt**, and an `ai.context` that led the
model somewhere. Both are obvious the moment you read the prompt.

Like the network log, it lives in memory, holds the last 20 runs, and is gone when you quit.

## Telling it what the data is

Column names and types say what the data _is_; only you can say what it _means_. Without
that, a small model is guessing at the shape of a row. `ai.context` is sent in front of every
record:

```jsonc
"ai": {
  "context": "Each row is one user account, reviewed to decide whether a person opened it or an automated system created it in bulk. `prev10Emails` holds the ten accounts registered immediately before this one — neighbours in time, not related accounts. Large free providers (gmail.com, hotmail.com) are unremarkable and prove nothing.",
}
```

Three things make the difference between context that helps and context that hurts:

- **Describe the data, not the answer.** "Decide whether this is fraud" turns the model into
  a labeler that agrees with whatever you hinted at. Say what the columns are and how they
  relate.
- **Say what is _normal_.** Most of the value is in ruling things out. A model that does not
  know gmail.com is unremarkable will flag it on every other row.
- **Keep it to a short paragraph.** It rides in front of every record inside a fixed context
  window, so a long one crowds out the record it is meant to explain. Over 2000 characters is
  a load error, not a silent truncation.

## Turning it off for a project

```jsonc
"ai": { "anomalyDetection": false }
```

The Settings section, the panel and every note disappear. Nothing is downloaded and nothing
runs.

To permit the feature but forbid fetching weights — an air-gapped machine, say, where a
model has been placed on disk already:

```jsonc
"network": { "modelDownload": false }
```

A model that is already present keeps working, because running it needs no network at all.
With no model present, the feature is hidden rather than shown as broken.

## Availability

macOS builds for Apple Silicon, Windows and Linux. Intel Macs do not ship the inference
binary, and the feature is simply absent there — everything else about the app is unchanged.
