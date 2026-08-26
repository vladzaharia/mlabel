---
title: Troubleshooting
description: Common problems and what they actually mean.
sidebar:
  order: 7
---

## "The input file does not match the input schema"

A column your config's `input.fields` declares is **missing** from the file. The file is
refused entirely and nothing is loaded — which also means a later export cannot write the
wrong file's rows under this file's name.

Check the header row against your config. Names must match exactly (they are trimmed of
surrounding whitespace, but not otherwise normalised — `Model Score` is not `model_score`).

**Extra** columns are only a warning; they are ignored.

## A value shows as empty with a note

The cell could not be read as the type the config declares — text where a number was
expected, an unparseable date, an `enum` value that is not one of the permitted choices.

You cannot fix this from inside MLabel, and you are not expected to. Label what you can. The
original value is preserved in `*-remaining` if the record ends up there. If it affects many
rows, the config's declared type is probably wrong for the data — tell whoever wrote it.

## The config won't load

Every problem is listed at once, each with a line, column and path. The usual causes:

| Message contains                            | Cause                                                    |
| ------------------------------------------- | -------------------------------------------------------- |
| `Unrecognized key`                          | A typo. Every object is strict; unknown keys are errors. |
| `no version` / `Unsupported config version` | The config predates the v2 schema.                       |
| `does not match input field`                | A `copy` field's type differs from its source column.    |
| `cannot be filled by a user`                | An `object` or `map` output field with no `fill`.        |
| `is reserved`                               | A shortcut the app or OS already owns.                   |

The full catalogue with fixes is at [Every error explained](/config/errors/).

## "These files already exist"

You have exported once already. MLabel will not overwrite a previous export — move or
delete `*-output` and `*-remaining`, then press **Done** again. See
[Exporting](/guide/exporting/#a-second-export-is-refused).

## My labels are gone

Check, in order:

1. **Did you export?** A successful export clears the saved session by design. Your work is
   in `*-output` and `*-remaining`.
2. **Is it the same pair of files?** Sessions are keyed to config _and_ input path. A
   renamed or moved file is a different session.
3. **Did you decline the resume prompt?** Declining discards the saved session.
4. **Did MLabel update?** A session written by a different version is discarded rather than
   read with the wrong meaning.

## The resume prompt says the file changed

The source file's contents differ from when you last saved. Labels are stored by row
position, so restoring onto a file whose rows were added, removed or reordered puts your
labels on the wrong records. Starting fresh is usually right.

Re-downloading a byte-identical file does **not** trigger this — only content is compared,
never the modification time.

## Updates never install

- **macOS**: the app is running from outside `/Applications`. See
  [Install on macOS](/start/install-macos/#why-applications-specifically).
- **Windows**: you have the portable build, which cannot self-install. See
  [Install on Windows](/start/install-windows/#the-portable-build).
- **Either**: your config sets `"network": { "updateChecks": false }`, which disables all
  network activity.

## A keyboard shortcut does nothing

Bare letter chords are suppressed while you are typing in a text box, textarea or dropdown
search — otherwise that letter could never be typed. Chords with a modifier work everywhere.
An open dialog takes the keyboard entirely. See [Keyboard shortcuts](/guide/keyboard/).

## Prepare refuses to join

Headers must match **exactly, in order**, across every file. The likeliest cause is mixing
kinds — an `*-output` file among `*-remaining` ones — since those follow different schemas.
Check the per-file list; each row shows what failed.
