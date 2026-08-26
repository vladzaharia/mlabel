---
title: Download
description: Pick the right MLabel build for macOS or Windows, and understand which ones update themselves.
sidebar:
  order: 2
---

All builds live on the [Releases page](https://github.com/vladzaharia/mlabel/releases/latest).

## Which build

| Platform                | Asset                                  | Use this?                          |
| ----------------------- | -------------------------------------- | ---------------------------------- |
| **macOS**               | `MLabel-<version>-<arch>.dmg`          | **Yes** — the normal download      |
| **macOS**               | `MLabel-<version>-<arch>-mac.zip`      | No — this is what auto-update uses |
| **Windows — installer** | `MLabel-<version>-<arch>.exe` (Setup)  | **Yes** — the normal download      |
| **Windows — portable**  | `MLabel-<version>-<arch>-portable.exe` | Only if you can't install          |

**On macOS, take the `.dmg`.** The `.zip` is published because Squirrel.Mac needs it to
apply updates, not because you should download it. A zip you unpack by hand arrives
quarantined, and macOS then runs the app from a read-only randomized path
(_App Translocation_) where it cannot update itself. Installing from the dmg avoids that
entirely.

**On Windows, take the installer** unless you specifically need a single file you can
carry on a USB stick or run without administrator rights. The portable build cannot
replace itself on disk, so when an update exists it tells you and opens the release page
rather than installing in place.

On macOS, `arm64` is for Apple Silicon (M1 and later) and `x64` is for Intel. If you are
not sure, check → _About This Mac_.

## Verifying what you downloaded

macOS builds are signed with an Apple Developer ID and notarized, so the operating system
has already verified them for you — they open normally, with no right-click-to-open dance.
If macOS _does_ complain, the download was corrupted or tampered with; delete it and
fetch it again.

Windows builds are **not** code-signed. SmartScreen will warn about them, and that warning
is expected rather than a sign of a problem. See
[Install on Windows](/start/install-windows/) for the exact steps.

## Then what

You need a config before MLabel can do anything. If someone is running a labeling project
for you, they will give you one. Otherwise, see [Set up your config](/start/setup/).

- [Install on macOS](/start/install-macos/)
- [Install on Windows](/start/install-windows/)
