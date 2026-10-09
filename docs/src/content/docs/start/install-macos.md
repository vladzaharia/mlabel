---
title: Install on macOS
description: Install the Mac app in Applications and open your first project.
---

1. [Download the `.dmg` for your Mac](/start/download/).
2. Open it and drag **MLabel** to the **Applications** shortcut.
3. Eject the disk image.
4. Open **MLabel** from Applications.

The published app is signed and notarized. If macOS reports a problem, confirm that you downloaded the correct release from the official project or your administrator. Follow your organization's installation policy rather than bypassing an unexplained warning.

## Why `/Applications` specifically

Installing in Applications gives MLabel a stable location for updates. Running from the disk image or a temporary location can prevent the app from updating itself.

If MLabel offers **Move MLabel to Applications?**, accept to move and relaunch it. You can decline, but may need to install later versions manually. [How updates work →](/start/updating/)

## Open your assignment

You need a project configuration (`.jsonc`) and a data file. Keep them in a writable project folder, outside the application bundle. [Open them in MLabel](/start/first-run/).

If you do not have a project yet, [create the sample project](/admin/first-project/).

## Uninstalling

Delete `MLabel.app` from Applications. Your project files and exports remain where you saved them.

Saved sessions, recent paths, and personal preferences are stored under:

```text
~/Library/Application Support/MLabel/
```

Keep that folder if you may reinstall and want to retain your preferences. Removing it also removes any unfinished saved session. Export work you need before removing application data.
