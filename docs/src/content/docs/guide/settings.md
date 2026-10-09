---
title: Settings
description: Rebinding keys, reading the loaded config back in plain language, inspecting the saved session, and checking what MLabel has contacted.
---

**Settings** (<kbd>⌘/Ctrl</kbd>+<kbd>,</kbd>, or the sliders button in the bottom bar)
answers one question: what is this copy of MLabel actually doing?

It opens over whatever you are working on, and nothing in it touches your data except the
one button that says it does.

## Keys

Every shortcut in the window — the app's own and the ones your config declared — with a
key cap you can click to record a new one. See
[Keyboard shortcuts](/guide/keyboard/#changing-any-of-them) for the rules.

A config with several choice fields can run to dozens of rows, so there is a filter box and
an **Only changed** toggle.

## Version and updates

The version you are running, the platform and architecture it is running on, the last thing
the updater said, and a **Check now** button.

The architecture is not a detail: [anomaly detection](/guide/anomalies/) ships for Apple
Silicon and not for Intel Macs, so `macOS · arm64` and `macOS · x64` are different answers to
"can this machine run a model".

Development builds check for updates like any other build — the request is the same one, and
it appears in the network log below. Only _installing_ needs a packaged app, so a dev build
offers a download link instead.

## What this config declares

A plain reading of the config in force: which formats go in and out, how many fields it
reads, how many it writes and what kind of work each is, how many cards and display rules,
whether network is permitted.

Deliberately shallow. It is there to tell you the _shape_ of what you are working with —
"eight output fields, five of which you answer" — not to audit the file. The file itself is
the detail, and **Change…** opens a different one.

:::caution
Switching config closes the data file you have open. Anything labeled but not exported goes
with it.
:::

## This session

What MLabel remembers about the work in progress: which config and data file, how far
through you are, the answers you gave once at the start, and the fingerprint of the source
file. It saves as you go — there is no save button.

**Clear session** throws away every label you have entered but not exported, and deletes
the saved session file. It asks first, and there is no undo. Values copied in from the
input survive, because those were never your answers.

## Network

MLabel makes two kinds of network request — checking GitHub for a new version, and fetching
model weights if you turn on [anomaly detection](/guide/anomalies/) — and this section is
where you can watch for them, or turn update checks off.

An **empty list is the expected state**, not a missing one. There is no banner saying so:
the log is the claim, and a reassurance printed above it adds nothing a reader has more
reason to trust than the list itself.

The toggle is opt-out and remembered across launches. If the loaded config sets
`network.updateChecks` to `false`, the toggle shows as locked: that gate sits below the
app, and nothing in this panel can open it. A config can always forbid more than a
preference allows, never less.

Denied requests are recorded too. If something ever asks for a host MLabel does not permit,
it appears here as blocked — which is the point of keeping the list — and a count next to
the heading says how many, since that is the one thing a row among rows does not announce.

The log lives in memory and is gone when you quit. An app whose whole claim is that it is
local has no business keeping a permanent file of what it did.
