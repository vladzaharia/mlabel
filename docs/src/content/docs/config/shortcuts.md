---
title: Keyboard shortcuts
description: Chord syntax, the single shared namespace, the reserved list, and how to budget shortcuts for a fast form.
---

A config can attach chords to fields and to individual choices. Both appear automatically in
the app's <kbd>?</kbd> dialog, so that list stays truthful without anyone maintaining it.

## Syntax

```
[modifier+]…key
```

Modifiers: `mod`, `ctrl`, `alt`, `shift`, `meta`. The key is a single letter or digit.

`mod` is **⌘ on macOS and Ctrl everywhere else** — write `mod` and both platforms are
correct.

```jsonc
"shortcut": "p"           // bare letter
"shortcut": "3"           // digit
"shortcut": "mod+s"       // ⌘S / Ctrl+S
"shortcut": "mod+shift+k" // ⌘⇧K / Ctrl+Shift+K
```

## Two places to attach one

**On a field** — moves focus to its widget:

```jsonc
{ "name": "notes", "type": "text", "widget": "textarea", "shortcut": "mod+n" }
```

**On a choice** — selects it directly, without focusing anything first:

```jsonc
{
  "name": "verdict",
  "type": "enum",
  "choices": [
    { "name": "correct", "display": "Correct", "shortcut": "c" },
    { "name": "incorrect", "display": "Incorrect", "shortcut": "x" },
  ],
}
```

Choice chords work on multi-selects too, where they **toggle** rather than replace.

## One namespace for the whole config

Field chords and choice chords share a single namespace. Two fields, two choices, or a field
and a choice claiming the same chord is an error:

```
Shortcut "c" is already used by choice "correct" on "verdict".
```

This is because **choice chords fire app-wide**, not only while their own field has focus.
That is what makes them worth having — you press <kbd>c</kbd> without tabbing anywhere
first. It also means two fields claiming `c` would be a genuine ambiguity with no way to
resolve it.

## Reserved chords

A config may not claim a chord the app or the OS already owns:

| Chord                                   | Owned by                               |
| --------------------------------------- | -------------------------------------- |
| `mod+z` `mod+x` `mod+c` `mod+v` `mod+a` | Undo / Cut / Copy / Paste / Select All |
| `mod+q` `mod+w` `mod+m` `mod+h`         | Quit / Close / Minimise / Hide         |
| `mod+r`                                 | Reload                                 |
| `mod+enter`                             | Save & export                          |
| `mod+shift+l`                           | Switch to Label mode                   |
| `mod+shift+p`                           | Switch to Prepare mode                 |

Claiming one is a config error rather than a silent override. The renderer calls
`preventDefault` on a match, so `mod+v` in a config would stop Paste working in the notes
box with nothing on screen to explain why.

A bare letter that merely _appears inside_ a reserved chord is fine — `"c"` is unrelated to
`mod+c`.

## Derived fields cannot take one

A `copy` or `timestamp` field renders no widget, so there is nothing to focus:

```jsonc
{ "name": "id", "type": "text", "fill": { "kind": "copy" }, "shortcut": "i" }
// ✗ A "copy" field renders no widget, so there is nothing to focus.
```

## Budgeting shortcuts

The built-in <kbd>1</kbd>–<kbd>9</kbd> already picks the *n*th choice of the focused choice
field, and costs nothing to declare. **Start there.** For a form whose main question is a
three-way rating, digits plus <kbd>Enter</kbd> is the entire interaction.

Declare explicit chords when:

- **Two choice fields compete for the digits.** Give the secondary one mnemonic letters.
- **The mnemonic is genuinely better.** <kbd>c</kbd>/<kbd>x</kbd> for correct/incorrect
  beats <kbd>1</kbd>/<kbd>2</kbd> because it survives someone reordering the choices.
- **A field is far down a long form.** A field chord jumps straight to it.

Prefer **bare letters for choices** (fast, and the digits stay free) and **`mod+` chords for
fields** (they keep working from inside a text box — see below).

## Why a bare letter sometimes does nothing

Bare chords are suppressed while the labeler is **typing**: in an input, a textarea, or a
dropdown's search field. Otherwise a chord on `c` would make the letter "c" impossible to
type into the notes box.

Chords with a modifier are **not** suppressed — they stay live everywhere.

Radio groups and sliders are a deliberate middle ground: they consume arrow keys, not
letters, so bare choice chords keep working while one of them has focus. That is what makes
those chords usable from anywhere on the form.

## Full reference

[OutputField](/reference/output-field/) · [Choice](/reference/choice/) ·
[the labeler's view](/guide/keyboard/)
