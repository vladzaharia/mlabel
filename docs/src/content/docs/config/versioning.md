---
title: Configuration and session compatibility
description: Distinguish the app release, config format, and saved-session format before upgrading.
---

Three version numbers serve different purposes. Do not replace one with another.

| Version              | Example           | What it controls                             |
| -------------------- | ----------------- | -------------------------------------------- |
| Application release  | MLabel 0.4.0      | The installed app and its available behavior |
| Configuration format | `"version": 2`    | How the app reads the `.jsonc` file          |
| Saved-session format | Stored internally | Whether saved progress can be restored       |

MLabel 0.4.0 reads configuration format **2**. A config should not declare `"version": "0.4.0"`.

## The two messages

**Missing version:** add `"version": 2` if the rest of the file is already in that format. An older config also needs the migration below.

**Unsupported config version:** check that the config and installed app are intended for one another. Changing the number alone does not convert the file.

The version check happens before structural and cross-field checks so the app can report an incompatible format directly.

## Coming from v1

| Earlier configuration                               | Format 2                                                       |
| --------------------------------------------------- | -------------------------------------------------------------- |
| A field's `control` determined its data and display | `type` defines the value; `widget` chooses a supported control |
| `control: "hidden"` copied a source value           | Use `fill: { "kind": "copy" }`                                 |
| Matching input/output names could imply copying     | Copying must be explicit                                       |
| Unknown settings could be ignored                   | Unknown settings are rejected, except adapter-owned options    |

### How to migrate

1. Keep the original config and data unchanged.
2. Create a new file using the [project tutorial](/admin/first-project/).
3. Add the source fields with their actual names and types.
4. Add each output field, choosing its type, fill, and control.
5. Load the new file in MLabel and fix validation errors. In a repository checkout, use `pnpm validate path/to/config.jsonc` as well.
6. Label and export a small representative sample. Compare stored values and headers before distributing it.

## Sessions are versioned too

An app update does not automatically invalidate a saved session. Compatibility depends on the saved-session format. Unrecognized formats are discarded.

Keep the same source/config paths when resuming, and do not edit or reorder the input rows. [Saved-session behavior](/guide/sessions/).

## Change a live project carefully

Use a new configuration filename or project version identifier when changing column meanings, choice values, required fields, or source types. Keep exports from different versions separate until you have checked compatibility.

A valid config is not proof that old and new datasets mean the same thing. Pilot the change and tell preparers which files belong together.
