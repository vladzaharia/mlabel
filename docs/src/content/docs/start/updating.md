---
title: Updating
description: How auto-update works, what each chrome-bar state means, and how to turn it off entirely.
sidebar:
  order: 7
---

The update check is **the only network request MLabel is capable of making**. Everything
else is denied at the network layer, in every configuration.

## How it works

Installed builds — the macOS app in `/Applications` and the Windows installer — check
GitHub Releases on startup, download any new version in the background, and apply it the
next time you restart. You are never interrupted mid-record.

The chrome bar shows where things stand:

| State                 | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| **Checking…**         | Asking GitHub whether a newer release exists.                       |
| **Up to date**        | You have the latest version.                                        |
| **Downloading…**      | A new version is being fetched, with progress.                      |
| **Restart to update** | Downloaded and staged. Quit and reopen to apply it.                 |
| **Update available**  | Portable builds only — click to open the download for your version. |
| **Error**             | The check failed. Click to retry.                                   |

On macOS you can also check manually: **MLabel → Check for Updates…**

## When updates can't install

Two cases, both covered in the install guides:

- **A portable Windows build** has no installer to hand off to, so it cannot replace itself.
  It links you to the right asset instead. See [Install on Windows](/start/install-windows/).
- **A macOS app running outside `/Applications`** is subject to App Translocation and
  cannot rewrite itself. Move it, and updates start working. See
  [Install on macOS](/start/install-macos/).

## Turning it off

Add this to your config:

```jsonc
{
  "version": 2,
  "network": { "updateChecks": false },
  // …
}
```

With `updateChecks: false`, MLabel makes **no network requests of any kind**. The check is
not merely skipped: the network layer refuses the request outright, and the updater is
never started.

This is the right setting for air-gapped machines and for any environment where outbound
traffic has to be justified. See [Network policy](/config/network/) for what is and is not
permitted, and [Deploying to labelers](/admin/deploying/) for rolling it out.

:::caution
`network` is validated strictly, like every other object in the config. A misspelled
`updateCheck` (no `s`) is a **load error**, not a silently ignored key — precisely so that
a config which reads as opting out cannot quietly leave checks running.
:::

## Which versions the policy allows

Even with checks enabled, the only destinations permitted are the MLabel releases path on
`github.com` and the GitHub asset hosts it redirects downloads to. Everything else,
including anything the window itself might attempt, is denied.
