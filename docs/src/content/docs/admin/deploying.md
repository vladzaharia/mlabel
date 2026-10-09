---
title: Distribute the app and configuration
description: Give labelers the right app, project configuration, instructions, and data.
---

Each labeler needs the application, the correct project configuration, an assigned data
file, and the labeling instructions. Include a project contact and a clear return process.

## What to send

A handoff folder can contain:

```text
review-project-v1/
  review-v1.jsonc
  data-part2-of-5.csv
  instructions.txt
```

Send the appropriate [MLabel download](/start/download/) separately or include the installer
in your delivery package. Tell labelers to install the app, open the named configuration,
and select their assigned CSV.

The instructions should explain the labels, difficult cases, when to export, and where to
return output and remaining files. Link to the [labeler guide](/labelers/) for app operation.

## Choosing a build

| Situation                      | Build                                                |
| ------------------------------ | ---------------------------------------------------- |
| Normal Windows installation    | Installer                                            |
| Windows use without installing | Portable executable                                  |
| macOS                          | DMG for Apple Silicon or Intel, matching the machine |

Windows builds are unsigned and may trigger SmartScreen; follow your organization's
software-installation policy. On macOS, install from the DMG into Applications. See the
[Windows](/start/install-windows/) and [macOS](/start/install-macos/) guides.

## Ship the config beside the executable

Automatic discovery is optional. MLabel searches the executable directory and its resources
directory for `config.jsonc`, `mlabel.config.jsonc`, then `mlabel.jsonc`. If no adjacent file
is found, it tries the most recently used configuration.

On a normal Windows installation, the executable directory is beside `MLabel.exe`.
On macOS, the executable is **inside** the app bundle; placing a configuration beside the
`.app` does not make it discoverable. For ordinary macOS distribution, keep the configuration
outside the signed bundle and have labelers select it explicitly. Avoid modifying the
installed bundle to distribute project data.

Check the loaded project in **Settings → Config** before labeling, especially when the app
remembers a previous assignment.

## Updates

By default, the configuration permits update checks. Labelers can turn them off in Settings.
For a fixed-version or offline project, set:

```jsonc
"network": { "updateChecks": false }
```

This blocks update traffic. Distribute a tested application version and handle future
updates deliberately. A labeler's preference cannot enable traffic the configuration forbids.

[Network policy →](/config/network/)

## Where MLabel writes

| Files                                          | Location                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Output and remaining records                   | Beside the input data file                                                       |
| Split parts                                    | Beside the source file                                                           |
| Joined file                                    | Destination selected by the preparer                                             |
| Saved session, settings, recents, window state | App data directory: `~/Library/Application Support/MLabel` or `%APPDATA%\MLabel` |

Labelers need write access to the input folder. If using shared storage, agree who can
modify source files while labeling is in progress.

## Give labelers a return checklist

Include these instructions with each assignment:

1. Use the named configuration and assigned source file.
2. To pause, close the app and resume the same files later.
3. To return work, select Save and send the output plus any remaining file.
4. Include the batch name, finished count, and remaining count in the handoff.
5. Keep the local copies until the preparer confirms receipt.

## Before distributing

- Validate the exact configuration you are sending.
- Pilot the project and inspect a real export.
- Give the configuration a clear version identifier and keep an archived copy.
- Confirm the app version, operating system, and architecture.
- Set the update policy deliberately.
- Explain the output location and request both finished and remaining files.
- Explain that saved sessions are local and remaining files do not carry partial answers.
