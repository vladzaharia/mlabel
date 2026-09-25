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
model. Five are offered, smallest first:

| Model           | Download | Per record | Raised | Worth looking at |
| --------------- | -------- | ---------- | ------ | ---------------- |
| Qwen3.5 2B      | 1.34 GB  | ~2.8 s     | 41%    | 44%              |
| Ministral 3 3B  | 2.19 GB  | ~5.2 s     | 87%    | 62%              |
| **Gemma 4 E2B** | 2.62 GB  | ~1.3 s     | 27%    | **75%**          |
| Qwen3.5 4B      | 2.91 GB  | ~3.6 s     | 27%    | 48%              |
| Gemma 4 E4B     | 4.22 GB  | ~1.4 s     | 1%     | 0%               |

**Gemma 4 E2B is the default**, and the two columns are why. "Raised" is how often it said
something over 150 records; "worth looking at" is how often that something turned out to
match a human's judgement on the same rows. They point in opposite directions — the model
that raised the most was right least often, and the most accurate model is also the fastest.

:::caution
These numbers come from one file of one kind — account records checked for automated signups,
where 60% of rows really were automated. So **60% is what guessing scores**, and a model at
44% is worse than a coin toss. Your data is not that data; treat the ranking as a starting
point and check a model on rows you already know the answer to.

For that task the config's own [display rules](/config/rules/) reached 92% — far ahead of
every model. Where you can write the rule, write the rule.
:::

Start with the default. Move to Ministral 3 only if you would rather see more and sift it
yourself; it raises three times as much and is right less often when it does.

All are Apache-2.0 and are fetched from Hugging Face over a single verified download. The
file's checksum is pinned in the app, so a changed upload fails rather than runs. Nothing is
looked up at download time: the app knows the exact file and its hash before it asks.

The download resumes if interrupted, and can be cancelled. Delete a model any time from the
same screen. If an MLabel update changes the model list, weights for a model that is no
longer offered are removed on the next launch rather than left occupying the disk.

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

- **A download of 1.3–4.2 GB**, once, depending on which model you pick — 2.6 GB for the
  default.
- **Memory while the model is loaded** — roughly two to three times the download size, so
  about 3 GB for the default and noticeably more for the largest. It unloads after five
  minutes idle and reloads when you next need it.
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
