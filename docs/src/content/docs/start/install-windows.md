---
title: Install on Windows
description: Choose the installer or portable app and find your project files.
---

## The installer (recommended)

1. [Download the Setup `.exe` for your computer](/start/download/).
2. Run it and follow the installer prompts.
3. Open **MLabel** from the Start menu.
4. [Load your configuration and assignment](/start/first-run/).

The installed build can download and install updates when both the project and your preferences permit them. [Update behavior →](/start/updating/)

## The portable build

The file with `portable` in its name runs without a separate installation step. Save it in a folder you can access, then open it. It still stores settings and saved-session data on the computer; “portable” does not mean no local files are written.

The portable build cannot install an update in place. When permitted to check, it can offer a link to a newer release. Replace the executable manually after closing the app.

## SmartScreen

Windows builds are unsigned, so SmartScreen may display **Windows protected your PC**. Confirm the source and expected filename before continuing. If your organization's policy permits running the official release, **More info → Run anyway** is the Windows option for proceeding.

If the file came from an unexpected source, or your organization blocks the app, ask your administrator. Do not disable system-wide protection to install it.

## Where things go

| Item                                           | Location                                 |
| ---------------------------------------------- | ---------------------------------------- |
| Installed app                                  | Usually `%LOCALAPPDATA%\Programs\MLabel` |
| Personal settings, recent paths, saved session | `%APPDATA%\MLabel\`                      |
| Labeling exports                               | Beside the input file                    |
| Joined datasets                                | The destination chosen in Prepare mode   |

Use a writable project folder for configuration and input files. Keep the source filenames and locations stable when resuming a saved session.

## Uninstall

Remove the installed build through Windows' installed-app settings, or delete the portable executable. Project files are separate. Remove `%APPDATA%\MLabel\` only if you also want to discard saved preferences and any unfinished session.
