---
title: Main process
description: Services in src/main, the invariants each one holds, and the failure modes they were written against.
sidebar:
  order: 3
---

Main owns everything the renderer must not: the file system, Electron, and the network gate.
It is ESM — no `__dirname`; use `import.meta.url`.

## Services

| Service                                  | Responsibility                                                    |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `config-service.ts`                      | Discover, read and load a config; arm or disarm the network gate. |
| `coordinator.ts`                         | Load input, save stamped sessions, run exports.                   |
| `pipeline.ts`                            | Pure: build record views, split records, serialize the export.    |
| `prepare-pipeline.ts`                    | Pure: split and join logic, validation, duplicate detection.      |
| `session-store.ts`                       | Persist and restore the session; recent paths.                    |
| `write-queue.ts`                         | One ordered pipe for session writes.                              |
| `atomic-write.ts`                        | Write-to-temp-then-rename, with fsync.                            |
| `fingerprint.ts`                         | Content hash of the source file.                                  |
| `network-guard.ts` / `network-policy.ts` | The request gate, and the pure policy behind it.                  |
| `updater.ts` / `update-status.ts`        | electron-updater wiring, and pure event → status mapping.         |
| `app-location.ts`                        | The macOS move-to-Applications prompt.                            |

The `pipeline` / `prepare-pipeline` split is the pattern worth copying: **main reads files,
a pure module decides.** Everything interesting is testable without Electron or a temp
directory.

## Invariants worth knowing

### The config is the network gate

`loadConfigFile` opens or closes the hard request gate _before_ starting the updater:

```ts
const updatesEnabled = result.config.network.updateChecks !== false;
setUpdatesEnabled(updatesEnabled);
if (updatesEnabled) startUpdates();
```

Ordering matters. Before any config loads, nothing is permitted at all.

### Only an accepted document is committed

`loadInputFromPath` returns early on a blocking header error **without** committing to app
state. Committing first left a rejected document resident, so a later export wrote the
_previous_ file's rows under the new file's name — and marked a schema-mismatched file as
recent.

### The renderer leaving a file is the only signal

`unloadInput` exists because nothing else tells main the renderer moved on. Without it the
parsed document stays resident for the process lifetime.

### Export writes both files or neither

A failed second write removes the first. An export never leaves a half-finished pair on disk
to be mistaken for a complete one. It also refuses to overwrite an earlier run unless
explicitly asked — and the renderer never asks.

### Sessions are serialised, not raced

`saveSession` and `clearSession` share one `write-queue`, so a save immediately followed by
a clear cannot reorder. `submitDone` additionally sets `phase: "done"` _synchronously_
before calling `clearSession`, which stops the autosave subscriber from re-saving into the
gap.

### Fingerprints ignore mtime

`fingerprintsEqual` compares size and hash only. A byte-identical re-download must not read
as stale.

### Sessions are version-gated both ways

A session whose version this build does not recognise is discarded rather than trusted — it
holds typed values whose meaning depends on the schema. Absent (legacy) counts as
unrecognised.

## Network policy

`network-policy.ts` has **zero Electron imports**, so every decision is unit-testable. The
wiring lives in `network-guard.ts`.

```ts
export function isRequestAllowed(url: string, ctx: PolicyContext): boolean;
export function isNavigationAllowed(url: string, ctx: { isDev: boolean }): boolean;
export function isAllowedExternalUrl(url: string): boolean;
```

Deny by default. Local schemes pass; dev loopback passes only in dev; the GitHub releases
path and its two asset hosts pass **only** for the updater scope and **only** while updates
are enabled. Everything else is refused.

Asset URLs are opaque signed CDN paths, so host-level matching is the finest feasible
granularity there.

## Reveal-path allowlisting

`revealPath` only accepts paths main itself produced — export output, remaining, split and
join results. Anything else rejects, so the renderer cannot use it to walk the file system.

## Menu

`buildMenuTemplate` is pure: it takes no Electron runtime references, so it can be exercised
in Node-only tests. A stateful singleton rebuilds it when context changes (config loaded,
mode switched, updater armed).

A test asserts every accelerator the menu emits appears in `RESERVED_CHORDS`, which is what
stops a config claiming a chord the menu already owns.

## Gotchas

- **Preload must be an unsandboxed `.mjs`** for ESM.
- **Drag-drop paths** come from `webUtils.getPathForFile`; `File.path` was removed.
- **Windows `titleBarOverlay`** only works with `titleBarStyle: "hidden"`, and its colours
  must be kept in sync with the active theme via `nativeTheme`.
- **`electron-updater` must stay external** — listed in `nodeExternals` and in
  `dependencies` — so it ships in the asar. Bundling it breaks updates.
- **Updates need a packaged build.** They no-op in dev.
