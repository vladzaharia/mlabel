---
title: Install on Windows
description: Installer or portable, and how to get past the SmartScreen warning on unsigned builds.
sidebar:
  order: 4
---

## The installer (recommended)

1. Download `MLabel-<version>-<arch>.exe` from the
   [Releases page](https://github.com/vladzaharia/mlabel/releases/latest) —
   `x64` for most machines, `arm64` for Windows-on-ARM devices.
2. Run it. See [SmartScreen](#smartscreen) below.
3. MLabel installs and adds a Start-menu entry.

This build **updates itself**: it checks GitHub Releases on startup, downloads in the
background, and applies the update on the next restart.

## The portable build

`MLabel-<version>-<arch>-portable.exe` is a single self-contained executable. Nothing is
installed and nothing is written to Program Files, which makes it the right choice when
you do not have administrator rights or need to run from removable media.

It **cannot update itself** — a portable exe has no installer to hand off to. When a newer
version exists, MLabel says so in the chrome bar and offers a link to the matching release
asset, which you download and replace by hand.

## SmartScreen

Windows builds are **not code-signed**, so Windows shows:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

Click **More info**, then **Run anyway**.

This warning means "this publisher has not bought a code-signing certificate", not "this
file is dangerous". If you want to satisfy yourself independently, every release is built
in the open by
[a GitHub Actions workflow](https://github.com/vladzaharia/mlabel/blob/main/.github/workflows/release.yml)
from a tagged commit — the build log shows exactly what went into the binary.

:::note
Code signing is planned but not in place. Until then, expect this prompt on every fresh
download.
:::

## Where things go

| What                                    | Where                                                   |
| --------------------------------------- | ------------------------------------------------------- |
| The app (installer build)               | `%LOCALAPPDATA%\Programs\MLabel`                        |
| Session, recent paths, window placement | `%APPDATA%\MLabel\`                                     |
| Your labels                             | Next to the input file you opened — never anywhere else |

To uninstall, use _Apps & features_ (installer) or just delete the exe (portable), then
remove `%APPDATA%\MLabel\` if you want to discard any unfinished session.

## Next

[Set up your config](/start/setup/) →
