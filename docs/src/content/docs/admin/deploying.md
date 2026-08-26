---
title: Deploying to labelers
description: Shipping the app and config together, auto-loading a config, and running fully offline.
sidebar:
  order: 3
---

A labeler needs three things: the app, a config, and their data. The less thinking any of
that requires, the better your project goes.

## Ship the config beside the executable

MLabel looks next to its own executable on startup for a config named, in order:

1. `config.jsonc`
2. `mlabel.config.jsonc`
3. `mlabel.jsonc`

If it finds one, it loads it automatically and the labeler never sees a config screen. They
open the app and are asked for a data file.

This is the single highest-value deployment step. It removes the "which file do I pick"
question entirely, and it makes it impossible to accidentally label against last month's
config.

| Platform          | Where to put it                                       |
| ----------------- | ----------------------------------------------------- |
| Windows portable  | The same folder as the `.exe`                         |
| Windows installer | The install directory, next to `MLabel.exe`           |
| macOS             | Beside the `.app`, or inside its `Contents/Resources` |

If no adjacent config is found, MLabel falls back to the most recently used one — so from
the second run onwards it is usually one less step regardless.

## What to send

A single folder or zip containing:

```
mlabel-toxicity-review/
  MLabel.exe               (or the dmg / installer)
  config.jsonc             ← auto-loaded
  data-part2-of-5.csv      ← their slice
  README.txt               ← three lines: open MLabel, drop the CSV, press Done
```

Send **one part per labeler**, not the whole file. See
[Distributing work](/admin/distributing/).

Tell them where the output lands: next to the data file, named after it. That is the single
most common support question.

## Choosing a build

| Situation                                 | Ship                                |
| ----------------------------------------- | ----------------------------------- |
| Managed Windows machines, admin available | The **installer** — it self-updates |
| No admin rights, or locked-down machines  | The **portable** exe                |
| macOS                                     | The **dmg**, always                 |

Two things to warn people about up front, because both look like something is wrong:

- **Windows**: builds are unsigned, so SmartScreen shows "Windows protected your PC". They
  need _More info → Run anyway_. Saying so in advance saves a support round-trip.
- **macOS**: installing from the dmg matters. A zip unpacked by hand arrives quarantined and
  cannot auto-update. See [Install on macOS](/start/install-macos/).

## Updates

Installed builds check GitHub Releases on startup and apply updates on next restart. For
most projects that is what you want — labelers get fixes without being asked to do anything.

**Pin the version instead** when a labeling run must not change underneath it. Turn checks
off in the config and distribute a specific build:

```jsonc
{
  "version": 2,
  "network": { "updateChecks": false },
  "input": {
    /* … */
  },
  "output": {
    /* … */
  },
}
```

With that set, MLabel makes **no network requests of any kind**. Not "skips the check" — the
request is refused at the network layer and the updater never starts. This is the setting
for air-gapped machines, and the one that makes "does this tool phone home" a flat no.

The cost is that updating becomes redistribution.

:::caution
`network` is validated strictly. A misspelled `updateCheck` is a **load error**, not a
silently ignored key — precisely so a config that reads as offline cannot quietly be online.
Run `pnpm validate` on the config you actually ship.
:::

## Where MLabel writes

Worth knowing before anyone asks whether it is safe to run on a work machine.

| What                              | Where                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| Labeled output                    | Next to the input file — **nowhere else**                   |
| Session, recents, window position | `~/Library/Application Support/MLabel` · `%APPDATA%\MLabel` |

No temp directories, no user home clutter, no telemetry, no crash reporting.

If labelers work on a network share, the output lands on the share. That is usually
convenient, occasionally slow, and worth deciding on deliberately.

## A checklist

- [ ] Config passes `pnpm validate`.
- [ ] Config piloted on 20 real rows — see [Planning](/admin/planning/#pilot-before-you-commit).
- [ ] Named `config.jsonc` and placed beside the executable.
- [ ] `updateChecks` set deliberately, either way.
- [ ] One data part per labeler.
- [ ] Labelers told about SmartScreen (Windows) or the dmg (macOS).
- [ ] Labelers told where output appears and to send back **both** `*-output` and
      `*-remaining`.
- [ ] A `session` field capturing who is labeling, so joined output is auditable.
