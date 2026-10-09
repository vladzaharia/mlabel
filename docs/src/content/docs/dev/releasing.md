---
title: Releasing
description: Tagging a release, what the pipeline does, the signing secrets, and the update-metadata contract.
sidebar:
  order: 8
---

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Pushing a `v*` tag is the entire release process.

## The pipeline

```
tag pushed
   │
   ├── verify   lint · format · typecheck · test    (parallel matrix)
   ├── build    electron-vite build → upload out/   (once, platform-agnostic)
   └── draft    create a draft release if missing
        │
        ▼
   package (macOS + Windows in parallel)
        │  download out/, package, sign, upload installers + latest*.yml
        ▼
   publish      flip the draft live
```

Three properties are worth understanding:

**The bundle is built once.** Both packaging jobs download the same `out/` artifact rather
than rebuilding. The bundle is platform-agnostic; only packaging is not.

**The draft is created up front.** Two runners uploading into a release neither has created
would race. Pre-creating a draft means both upload into something that already exists, and
`publish` un-drafts it once everything has landed.

**The version comes from the tag**, passed as `--config.extraMetadata.version`. `package.json`
is not the source of truth at release time, so a tag and a stale `version` field cannot
disagree.

## Signing secrets

Under **Settings → Secrets and variables → Actions**:

| Secret              | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `APPLE_API_KEY_B64` | base64 of the App Store Connect `.p8` key     |
| `APPLE_API_KEY_ID`  | Key ID                                        |
| `APPLE_API_ISSUER`  | Issuer UUID                                   |
| `APPLE_TEAM_ID`     | Apple Developer Team ID                       |
| `CSC_LINK`          | base64 of the Developer ID Application `.p12` |
| `CSC_KEY_PASSWORD`  | Password for that `.p12`                      |

:::caution[`CSC_*` must not reach the Windows runner]
They are gated to the macOS matrix leg:

```yaml
CSC_LINK: ${{ matrix.platform == 'mac' && secrets.CSC_LINK || '' }}
```

The signing cert is an Apple Developer ID identity. Leaked to Windows, electron-builder
feeds it to SignTool and the job fails. The `APPLE_*` variables are inert there and are
passed unconditionally.
:::

Windows ships **unsigned**. Adding `win.signtoolOptions` or Azure Trusted Signing later
needs no other change.

## Artifacts

| Platform | Assets                                                                |
| -------- | --------------------------------------------------------------------- |
| macOS    | `.dmg` (the human download) and `.zip` (**required** by Squirrel.Mac) |
| Windows  | NSIS installer and a portable `.exe`                                  |
| Both     | `latest-mac.yml` / `latest.yml` — the update metadata                 |

Both macOS assets ship on purpose. `latest-mac.yml` points at the zip, so dropping it breaks
updates for every existing install; the dmg exists because installing from it avoids the
Gatekeeper translocation that would otherwise block those updates.

The portable and dmg filenames are pinned in `electron-builder.yml` so the app can deep-link
the exact asset when it cannot self-update.

## The update contract

`electron-updater` **must stay external** — listed in `nodeExternals` in
`electron.vite.config.ts` _and_ in `package.json` `dependencies`. Bundling it breaks updates
silently: the packaged app looks fine and simply never updates again.

Updates require `app.isPackaged`. They no-op in dev, so the only way to test the path is a
packaged build.

## Before tagging

- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test`
- [ ] `pnpm schema` produces no change (the test catches this, but check early)
- [ ] `package.json` version bumped, if you keep it in step with tags
- [ ] Built locally at least once: `pnpm build:mac` or `pnpm build:win`
- [ ] Docs rebuilt if `src/core/config/**` changed — see [the docs site](/dev/contributing/)

## Local packaging

```bash
pnpm build:mac    # build + package, signing from .env
pnpm build:win    # build + package, unsigned
```

`package:mac` / `package:win` are the CI variants: they package a prebuilt `out/` and publish.
Do not run those locally unless you intend to publish.

## Dependency holds

Two pins are deliberate, and CLAUDE.md is the source of truth:

- **Babel stays on 7.x.** `babel-plugin-react-compiler` has no Babel 8 support. The plan is
  to drop Babel entirely once React's Rust compiler port ships in `plugin-react` — not to
  migrate to Babel 8 in between.
- **Electron 43 is held.** Revisit at 43.0.1+; 42.x receives patches until roughly October 2026.
