<div align="center">
  <img src="build/icon.png" alt="MLabel" width="96" height="96" />
  <h1>MLabel</h1>
  <p><strong>A fully local, zero-network desktop app for manual data labeling.</strong></p>
</div>

MLabel ingests tabular data, shows you one record at a time, and exports labeled data
matching a configured output schema. **Everything** displayed and captured is driven by a
single `.jsonc` config file — no formats or schemas are hard-coded. It runs entirely on your
machine: nothing you load or label ever leaves it.

---

## Download

Grab the latest build for your platform from the
[**Releases**](https://github.com/vladzaharia/mlabel/releases/latest) page.

| Platform                          | Download                               | First run                                                                                                                      |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **macOS** (Apple Silicon / Intel) | `MLabel-<version>-<arch>-mac.zip`      | Unzip and drag `MLabel.app` to Applications. Builds are signed & notarized, so they open normally.                             |
| **Windows — installer**           | `MLabel-<version>-<arch>.exe` (Setup)  | Recommended. Installs MLabel and **auto-updates** itself. SmartScreen may prompt (unsigned) — choose _More info → Run anyway_. |
| **Windows — portable**            | `MLabel-<version>-<arch>-portable.exe` | A single self-contained exe; no install. It checks for updates and links you to the new download (no self-update).             |

### Configure & label

1. Launch MLabel and select a config `.jsonc` (see [`examples/config.jsonc`](examples/config.jsonc)),
   or drop one onto the window. A config adjacent to the executable is picked up automatically.
2. Select (or drag in) a CSV that matches the config's input schema.
3. Label one record at a time. On **Done**, MLabel writes `*-output.*` (complete records) and
   `*-remaining.*` (untouched/incomplete records) next to your input.

## Auto-update

Installed builds (macOS and the Windows installer) check GitHub Releases on startup, download
in the background, and apply the update on the next restart. The chrome bar shows the current
status ("Checking…", "Up to date", "Downloading…", "Restart to update").

This is the **only** network the app ever performs, and it is opt-out. To keep MLabel fully
offline, set this in your config:

```jsonc
{
  "network": { "updateChecks": false }, // no network calls of any kind
  "input": {
    /* … */
  },
  "output": {
    /* … */
  },
}
```

When `network` is absent or `updateChecks` is `true`, update checks run.

## Develop

Requires [Node 22+](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev        # run the app with hot reload
```

| Task                      | Command                                          |
| ------------------------- | ------------------------------------------------ |
| Dev (HMR)                 | `pnpm dev`                                       |
| Typecheck                 | `pnpm typecheck`                                 |
| Lint / fix                | `pnpm lint` / `pnpm lint:fix`                    |
| Format / check            | `pnpm format` / `pnpm format:check`              |
| Test (all / node / dom)   | `pnpm test` · `pnpm test:node` · `pnpm test:dom` |
| Emit config JSON Schema   | `pnpm schema`                                    |
| Build                     | `pnpm build`                                     |
| Package locally (mac/win) | `pnpm build:mac` / `pnpm build:win`              |

Architecture and conventions live in [`CLAUDE.md`](CLAUDE.md).

## Release

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): it
verifies, builds the bundle once, packages macOS + Windows in parallel, and publishes a GitHub
Release with the installers and update metadata.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

macOS signing/notarization requires these repository secrets
(**Settings → Secrets and variables → Actions**):

| Secret              | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `APPLE_API_KEY_B64` | base64 of the App Store Connect `.p8` key     |
| `APPLE_API_KEY_ID`  | key ID                                        |
| `APPLE_API_ISSUER`  | issuer UUID                                   |
| `APPLE_TEAM_ID`     | Apple Developer Team ID                       |
| `CSC_LINK`          | base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD`  | password for that `.p12`                      |

## License

[MIT](LICENSE) © 2026 Vlad Zaharia
