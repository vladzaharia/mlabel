---
title: Anomaly detection
description: An optional local decision model that answers questions about each record ahead of you — what it is, what it costs, and why its answers never reach your output file.
---

MLabel can run a small **decision model** entirely on your own machine to read each record
before you get to it. A decision model does not write prose: you declare the possible
answers in your config, before it runs, and it returns a **calibrated probability** for each
one. There is nothing to interpret, and it cannot answer with anything you did not list.

Out of the box it asks two questions of every record:

- **Is anything internally inconsistent?** A username that is really an email address, a
  value that does not belong in its column, a date that contradicts another.
- **Could two careful people label this differently?** A different and often more useful
  signal: it finds the records your guidelines do not cover yet, rather than the ones that
  are wrong.

You can add your own — see [asking your own questions](#asking-your-own-questions).

It is off until you turn it on, and a project's config can remove it altogether.

## What it is not

It is **not** a labeler. Nothing it says is written to your output file, and there is no
button that turns a suggestion into an answer. That is a structural guarantee, not a
promise: the code that produces answers is not reachable from the code that writes files,
the same way display rules are kept apart.

It is also **not reliable**. "Calibrated" means a 0.8 is right about four times in five —
which is genuinely useful and still wrong one time in five. Treat an answer as a reason to
look, never as a reason to decide.

:::caution
A probability is more persuasive than a hedge, and that cuts both ways. "This looks odd" is
self-evidently a guess; **91%** reads like a measurement. It is better calibrated than prose
_and_ easier to defer to, so the habit of checking matters more here, not less.
:::

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
model. Three are offered:

| Model    | Download | Notes                                        |
| -------- | -------- | -------------------------------------------- |
| JevK5 4B | 2.71 GB  | Recommended. Best accuracy per byte          |
| JevK5 2B | 2.01 GB  | Smallest and fastest; weaker on hard records |
| JevK5 9B | 6.47 GB  | Most accurate, and wants a strong machine    |

All three are Apache-2.0 and are fetched from Hugging Face over a single verified download.
The file's checksum is pinned in the app, so a changed upload fails rather than runs.

Each one also pins the calibration temperature measured for that exact file. It is part of
the file's identity rather than a setting: read at the wrong temperature, a model returns
confident numbers that are quietly wrong.

The download resumes if interrupted, and can be cancelled. Delete a model any time from the
same screen.

## Where the notes appear

Where an answer appears is decided by the question that produced it:

- **Beside the value**, for a question with a `field`.
- **Across the top of a card**, for a question with a `card`.
- **Under the answers**, in a "Model notes" panel — for questions with neither, including
  the two the app always asks, since those have nowhere else to sit.

An answer is shown only when the model is sure enough: above `showAbove`, which defaults to
**0.7**. Below that, nothing is said at all. A confident _no_ is not a finding, so a
record the model is sure is fine stays quiet rather than collecting a note saying so.

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
as the model saw it, the instructions it was given, and **every** answer, including the ones
that fell below their threshold and were never shown. Those are often the interesting ones.

This is the counterpart to the [network log](/guide/settings/#network), and it is there for
the same reason. Being told to verify a suggestion is only actionable if you can see what
produced it, and the two things that most often mislead this feature are both invisible from
the note alone: a long value or a neighbour **truncated out of the prompt**, and an
`ai.context` that led the model somewhere. Both are obvious the moment you read the prompt.

Like the network log, it lives in memory, holds the last 20 runs, and is gone when you quit.

## Asking your own questions

The two built-in questions are deliberately generic — they ship with the app, so they cannot
assume anything about your data. Everything specific to it goes in `ai.questions`, where each
entry declares its own answers.

Three kinds:

```jsonc
"ai": {
  "questions": [
    // A yes/no question, answered with the probability that it is yes.
    {
      "id": "refusal",
      "type": "boolean",
      "field": "response",
      "ask": "Does the response refuse or deflect instead of answering?",
      "whenTrue": "it declines, hedges, or answers a different question",
      "whenFalse": "it attempts the task it was given",
    },
    // One of a fixed set. Each option gets its own probability.
    {
      "id": "kind",
      "type": "choice",
      "ask": "What kind of task was the prompt?",
      "options": [
        { "name": "question", "means": "asks for a fact or an explanation" },
        { "name": "generation", "means": "asks for text to be written" },
        { "name": "other" },
      ],
    },
    // An ordered scale, weakest level first.
    {
      "id": "severity",
      "type": "score",
      "ask": "How serious is the worst problem with this response?",
      "levels": ["none", "minor", "clear", "severe"],
      "showAbove": 0.55,
    },
  ],
}
```

A `score` answers with a **weighted average of the level positions**, not a single level. So
`1.2` means mostly `minor` with a little `clear` — which is why the order matters, and why
scores can be compared across records.

### Where the answer goes

`field` puts it beside that value, `card` puts it on that card, and neither puts it in the
panel. You cannot give a question both. Names are checked when the config loads, so a typo
is a load error rather than an answer that never appears.

### Only asking when it is relevant

`when` takes the same [condition](/config/rules/) a display rule uses:

```jsonc
{
  "id": "mismatch",
  "type": "boolean",
  "card": "sample",
  "ask": "Does the response fail to address its prompt?",
  "when": { "op": "notEmpty", "field": "response" },
}
```

A question whose condition does not hold is never sent to the model at all. That makes `when`
the main lever for keeping analysis quick, as well as for keeping irrelevant answers out of
the way.

### Writing a question the model can answer

- **Ask one thing.** "Is the response wrong or badly formatted?" has two answers and gets
  one probability, which tells you nothing about which.
- **Use `means` and `whenTrue`/`whenFalse` where a label is ambiguous on its own.** They are
  shown to the model, never to the labeler, and they are often what separates a useful
  question from a coin flip.
- **Keep `choice` under 16 options and `score` under 10 levels.** Both are enforced; past
  those the published calibration stops applying.
- **Lower `showAbove` where a false positive is cheap** and raise it where a wrong
  suggestion costs attention you would rather spend elsewhere.

## Showing it the neighbouring records

An anomaly is relative. On its own, a record gives the model nothing to compare against —
it cannot know whether a value is unusual _for this file_. `ai.neighbours` shows it the rows
either side:

```jsonc
"ai": { "neighbours": { "before": 2, "after": 2 } }
```

Two either side is usually enough to make "out of place" mean something. Three things to know:

- Neighbours are **context, never the subject**. Every question is still about the record
  under review; the others are there to show what ordinary looks like.
- Only their **input values** travel, never their labels. Showing those would let the model
  agree with whatever was recently decided rather than read the data — a failure that looks
  exactly like success.
- Every extra record **costs prompt space on every analysis**, and the window is trimmed from
  the outside in when it does not fit. Raise it as far as it helps and no further.

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
