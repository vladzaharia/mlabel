# MLabel — Project Guide for Agents

MLabel is a **fully local** (zero-network) Electron desktop app for manual data
labeling. It ingests tabular data, shows one record at a time, and exports labeled
data matching a configured output schema. **Everything** displayed and captured is
driven by a single `.jsonc` config file — no schemas or formats are hard-coded.

## Golden rules

1. **Zero network at runtime.** No `fetch`, no telemetry, no remote calls anywhere
   in main/preload/renderer. The CSP forbids it; keep it that way.
2. **The core is format-agnostic.** `src/core/` must never depend on Electron or on
   any adapter's internals. CSV is just the first adapter. Adding a new source/sink
   format must require **no changes** to `src/core/` (except registering the adapter),
   the renderer, or the config schema.
3. **Adapter internals stay private.** Format specifics (e.g. CSV raw bytes, BOM,
   delimiter) live behind an opaque `ProvenanceToken` inside that adapter's folder
   (`src/core/adapters/<id>/`). Nothing outside the adapter may import its internal
   types — enforced by an oxlint `no-restricted-imports` rule.
4. **Heavy work runs in the main process.** Parsing, validation, coercion, and file
   I/O happen in `src/main/`; the renderer is presentation-only and talks to main
   through the typed `window.api` IPC contract in `src/core/ipc.ts`.
5. **One source of truth per concern.** The Zod config schema, the `ValueType` union,
   and the `IpcApi` interface each have exactly one definition in `src/core/`.

## Architecture

```
src/core/      System-agnostic. types, Zod config schema, coercion, auto-mapping,
               completion, adapter interfaces + registry, CSV adapter, IpcApi.
src/main/      Electron main (Node ESM): window, CSP, nativeTheme, config-service,
               coordinator (parse→coerce→auto-map→export), session-store, IPC handlers.
src/preload/   contextBridge exposing `window.api` (typed via IpcApi).
src/renderer/  React 19 UI: chrome bars, category cards, recursive input formatters,
               RHF output form, Zustand store. Imports from @core only.
```

Data flow: `SourceAdapter.parse` → `RawRecord[]` (with opaque provenance) →
core `coerce` per `ValueType` → `LabeledRecord` (input + label values) → user labels
in renderer → on Done, `SinkAdapter.serialize` writes `*-output.*` (complete records)
and `*-remaining.*` (byte-faithful unlabeled/incomplete records).

## Commands

| Task             | Command                                                               |
| ---------------- | --------------------------------------------------------------------- |
| Dev (HMR)        | `pnpm dev`                                                            |
| Typecheck        | `pnpm typecheck` (node + web projects)                                |
| Lint             | `pnpm lint` / `pnpm lint:fix`                                         |
| Format           | `pnpm format` / `pnpm format:check` (oxfmt)                           |
| Test (all)       | `pnpm test` · node only: `pnpm test:node` · dom only: `pnpm test:dom` |
| Emit JSON Schema | `pnpm schema`                                                         |
| Build app        | `pnpm build`                                                          |
| Package mac/win  | `pnpm build:mac` / `pnpm build:win`                                   |

## Conventions

- **TypeScript**: ESM everywhere (`"type":"module"`); `verbatimModuleSyntax` →
  always `import type` for type-only imports. `moduleResolution: bundler`.
- **Aliases**: `@core/*` → `src/core/*`; `@/*` → `src/renderer/src/*`. Mirror any
  change across `tsconfig.base.json` and `electron.vite.config.ts`.
- **Main is ESM**: no `__dirname`; use `import.meta.url` / `fileURLToPath`. The preload
  is emitted as an **unsandboxed `.mjs`**.
- **React 19 + Compiler is on**: don't hand-write `useMemo`/`useCallback` for new code
  unless profiling demands it.
- **Tailwind v4** is CSS-first (`@import "tailwindcss"`, `@theme`, `@custom-variant`);
  there is no `tailwind.config.js`.
- **Tests** are co-located `*.test.ts(x)`; pure-logic tests go in the `node` Vitest
  project (use `fast-check` + golden files), component tests in the `dom` project.
- **TDD** for everything in `src/core/` and `src/main/`: red → green → refactor.

## Gotchas

- Preload must be unsandboxed `.mjs` for ESM; drag-drop file paths come from
  `webUtils.getPathForFile` (the old `File.path` was removed).
- Windows `titleBarOverlay` only works with `titleBarStyle:'hidden'`; keep its colors
  synced to the active theme via `nativeTheme`.
- `base:"./"` (relative) is required so renderer assets load under `file://` in the
  packaged app; prefer imported assets over `public/`.
- pnpm needs `node-linker=hoisted` (in `.npmrc`) for electron-builder.
- oxfmt is beta and the sole formatter: if it ever blocks a commit, bypass once with
  `--no-verify` and fix — never silently disable the hook.
