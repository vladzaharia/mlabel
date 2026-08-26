---
title: Install on macOS
description: Unzip, move to Applications, and why that move is what makes auto-update work.
sidebar:
  order: 3
---

1. Download `MLabel-<version>-<arch>.dmg` from the
   [Releases page](https://github.com/vladzaharia/mlabel/releases/latest) —
   `arm64` for Apple Silicon, `x64` for Intel.
2. Open the dmg.
3. **Drag `MLabel` onto the Applications shortcut** in the window that appears.
4. Eject the dmg and open MLabel from Applications.

Builds are signed with an Apple Developer ID and notarized, so step 4 just works — no
Gatekeeper override, no right-click → Open.

:::caution[Don't install from the zip]
The Releases page also carries `MLabel-<version>-<arch>-mac.zip`. That asset exists so
Squirrel.Mac can apply updates; it is not the download for a person. Read on for why it
matters.
:::

## Why `/Applications` specifically

macOS runs a **quarantined** app from outside `/Applications` under **App Translocation**:
it is executed from a read-only, randomized path. An app in that state cannot rewrite
itself, so **automatic updates silently cannot install** — there is no error, updates
simply never apply.

Unpacking the zip by hand into Downloads is exactly how you end up there. Installing from
the dmg does not quarantine the installed copy, so this never comes up.

If you do launch MLabel from outside `/Applications`, it notices and offers to move itself:

> **Move MLabel to Applications?**
> MLabel is running from outside your Applications folder, which prevents automatic
> updates from installing. Move it to Applications to enable updates.

Accepting moves the app and relaunches it from the new location. You can decline and keep
using MLabel — everything except in-place updating works fine, and you would download new
versions by hand.

:::note
The prompt only appears for packaged builds, on macOS, running from outside
`/Applications`. It never appears in development, and never on Windows.
:::

## Uninstalling

Delete `MLabel.app`. Two small files hold your window position, recent paths, and any
in-progress labeling session:

```
~/Library/Application Support/MLabel/session.json
~/Library/Application Support/MLabel/recent.json
```

Deleting them discards any unfinished session. Your data files and config are never
touched — MLabel only ever writes next to the input file you opened.

## Next

[Set up your config](/start/setup/) →
