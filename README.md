<div align="center">
  <img src="build/icon.png" alt="MLabel" width="96" height="96" />
  <h1>MLabel</h1>
  <p><strong>A fully local, zero-network desktop app for manual data labeling.</strong></p>
  <p>
    <a href="https://mlabel.vlad.gg"><strong>Documentation</strong></a> ·
    <a href="https://github.com/vladzaharia/mlabel/releases/latest">Download</a> ·
    <a href="https://mlabel.vlad.gg/config/">Config schema</a>
  </p>
</div>

MLabel ingests tabular data, shows you one record at a time, and exports labeled data
matching a configured output schema. **Everything** displayed and captured is driven by a
single `.jsonc` config file — no formats or schemas are hard-coded. It runs entirely on your
machine: nothing you load or label ever leaves it.

---

## Download

Grab the latest build from the
[**Releases**](https://github.com/vladzaharia/mlabel/releases/latest) page.

| Platform                | Download                               | Notes                                                                        |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| **macOS**               | `MLabel-<version>-<arch>.dmg`          | Signed & notarized. Install from the dmg, not the zip.                       |
| **Windows — installer** | `MLabel-<version>-<arch>.exe` (Setup)  | Recommended. Auto-updates. SmartScreen will prompt (unsigned).               |
| **Windows — portable**  | `MLabel-<version>-<arch>-portable.exe` | Single self-contained exe; links you to updates rather than self-installing. |

Full instructions: [Download](https://mlabel.vlad.gg/start/download/) ·
[macOS](https://mlabel.vlad.gg/start/install-macos/) ·
[Windows](https://mlabel.vlad.gg/start/install-windows/)

### Label something

1. Launch MLabel and pick a config `.jsonc` (see [`examples/config.jsonc`](examples/config.jsonc)),
   or drop one on the window. A config next to the executable is picked up automatically.
2. Pick (or drag in) a CSV matching the config's input schema.
3. Label one record at a time. On **Done**, MLabel writes `*-output.*` (complete records) and
   `*-remaining.*` (unfinished ones) next to your input.

→ [Your first labeling run](https://mlabel.vlad.gg/start/first-run/)

## Configs

Everything the app shows and captures comes from one file. Point it at the published schema
for autocomplete and inline validation:

```jsonc
{
  "$schema": "https://mlabel.vlad.gg/mlabel.schema.json",
  "version": 2,
  "input": { "fields": [{ "name": "text", "type": "text" }] },
  "output": {
    "fields": [
      { "name": "label", "type": "enum", "choices": [{ "name": "good" }, { "name": "bad" }] },
    ],
  },
}
```

Check one without launching the app:

```bash
pnpm validate path/to/config.jsonc
```

→ [Anatomy of a config](https://mlabel.vlad.gg/config/) ·
[Value types](https://mlabel.vlad.gg/config/types/) ·
[Every error explained](https://mlabel.vlad.gg/config/errors/) ·
[Authoring as an agent](https://mlabel.vlad.gg/config/agents/)

## Zero network

The GitHub-Releases update check is the only remote request MLabel can make, and it is
opt-out — `"network": { "updateChecks": false }` disables it and every other network call.

→ [Network policy](https://mlabel.vlad.gg/config/network/)

## Develop

Requires [Node 22+](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev        # the app, with hot reload
```

| Task                      | Command                                          |
| ------------------------- | ------------------------------------------------ |
| Dev (HMR)                 | `pnpm dev`                                       |
| Typecheck                 | `pnpm typecheck`                                 |
| Lint / fix                | `pnpm lint` / `pnpm lint:fix`                    |
| Format / check            | `pnpm format` / `pnpm format:check`              |
| Test (all / node / dom)   | `pnpm test` · `pnpm test:node` · `pnpm test:dom` |
| Emit config JSON Schema   | `pnpm schema`                                    |
| Validate a config         | `pnpm validate <file>`                           |
| Build                     | `pnpm build`                                     |
| Package locally (mac/win) | `pnpm build:mac` / `pnpm build:win`              |

The docs site lives in [`docs/`](docs/) as a standalone package:

```bash
pnpm -C docs install && pnpm -C docs dev
```

→ [Architecture](https://mlabel.vlad.gg/dev/architecture/) ·
[Contributing](https://mlabel.vlad.gg/dev/contributing/) ·
[Releasing](https://mlabel.vlad.gg/dev/releasing/)

Agent-facing conventions live in [`CLAUDE.md`](CLAUDE.md).

## License

[MIT](LICENSE) © 2026 Vlad Zaharia
