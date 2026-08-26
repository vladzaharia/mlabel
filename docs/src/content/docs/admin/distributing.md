---
title: Distributing work
description: Splitting a file across labelers, collecting their output, and joining it back with validation.
sidebar:
  order: 2
---

MLabel has no server and no work queue. Distribution is file-based: split a file into parts,
hand them out, join the results.

## The workflow

```
data.csv
   │  Prepare → Split into 3
   ▼
data-part1-of-3.csv ──▶ labeler A ──▶ data-part1-of-3-output.csv
data-part2-of-3.csv ──▶ labeler B ──▶ data-part2-of-3-output.csv     ├── Prepare → Join
data-part3-of-3.csv ──▶ labeler C ──▶ data-part3-of-3-output.csv     ▼
                                                            data-output-joined.csv
```

Each part is a valid input file for the same config, so a labeler just opens theirs and
works. Nothing about the parts is special.

## Splitting

Prepare mode, <kbd>⌘/Ctrl</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd>. Drop the source file, confirm
**Split**, choose how many parts.

Records are divided into **contiguous** chunks whose sizes differ by at most one, larger
chunks first — 10 records into 3 gives 4, 3, 3. Contiguous rather than interleaved, so a
part is a readable slice of the original rather than a scatter.

Files are written next to the source with predictable names:

```
data.csv → data-part1-of-3.csv, data-part2-of-3.csv, data-part3-of-3.csv
```

The preview shows exactly which names will be written before you commit, and existing files
are never overwritten — a collision fails the operation and lists the conflicting paths.

### How many parts

One per labeler is the obvious answer and often the wrong one. Smaller parts are better:

- a labeler who drops out costs you one small part, not a third of the project,
- progress is visible earlier,
- someone who finishes early can take another part.

Sized for two to four hours of work is a reasonable default. You can split a part again
later — the naming strips the old part suffix before re-deriving, so parts of parts do not
accumulate suffixes.

## While labeling is happening

Each labeler ends up with up to two files:

- `<part>-output.csv` — their completed records.
- `<part>-remaining.csv` — anything they did not finish.

Ask for both. A remaining file is not waste — it is a valid input file, and it is how you
reassign unfinished work to someone else.

## Joining

Drop all the finished files into Prepare together. MLabel proposes **Join outputs** or
**Join remaining** based on what it sees, and asks before acting.

Everything is checked before a byte is written:

| Check                                 | Severity  | Why                                                            |
| ------------------------------------- | --------- | -------------------------------------------------------------- |
| Headers match exactly, in order       | **error** | Cells are positional; a reordered header shifts every value    |
| Output rows satisfy the output schema | **error** | Every value coerces, required fields present, constraints pass |
| Remaining rows coerce                 | warning   | Labeling tolerates a bad source cell, so joining does too      |
| Duplicate rows                        | warning   | Catches the same part submitted twice                          |

**Do not mix kinds.** Output files and remaining files follow different schemas; joining
them together fails on headers.

You choose where the result goes. The default name strips the part and kind suffixes and
appends the join kind: `data-part1-of-3-output.csv` → `data-output-joined.csv`.

## Reassigning leftovers

Join the `*-remaining` files into one, split that, and hand the new parts out. The remaining
file is deliberately value-faithful in the input schema so this round-trips.

```
*-remaining.csv ×3  ──▶ join ──▶ data-remaining-joined.csv ──▶ split ──▶ new parts
```

## What round-trips exactly

Values, column order and the detected dialect survive exactly — that is guaranteed and
property-tested. Incidental formatting does not: byte-order marks, header padding, the
original quoting style, blank lines, trailing newline.

That matters only if you are diffing against the original file byte-for-byte. For anything
that parses CSV, including MLabel itself, the files are equivalent.

## Practical notes

- **Send the config with every part.** Labelers cannot open a part without it, and a part
  labeled against a _different_ config produces a file that will not join. See
  [Deploying](/admin/deploying/).
- **Prepare re-reads files when it runs**, not when you dropped them. Editing a file between
  analysis and run is safe — you get the current contents.
- **A config must be loaded** before Prepare will do anything; it validates against it.
- **Keep the originals.** Splits and joins never modify their inputs, but the discipline
  costs nothing.

## Auditing what came back

Because every output row carries whatever `session` fields you declared, the joined file
answers "who labeled this" and "under which guidelines" without any external bookkeeping.
If you did not declare them, that information exists nowhere — see
[Planning](/admin/planning/#session-versus-per-record).
