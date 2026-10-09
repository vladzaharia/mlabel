# MLabel — Project Guide for Agents

MLabel is a **local-first** Electron desktop app for manual data labeling: it makes no
network request unless a config permits one and a labeler asks for it. It ingests tabular data, shows one record at a time, and exports labeled
data matching a configured output schema. **Everything** displayed and captured is
driven by a single `.jsonc` config file — no schemas or formats are hard-coded.

## Golden rules

1. **Zero unsolicited network.** No `fetch`, no telemetry, no remote calls in
   main/preload/renderer — with exactly **two** exceptions, each gated by its own
   config flag, each on its own session, and each denied by default:

   | Traffic                         | Gate                    | Where                       |
   | ------------------------------- | ----------------------- | --------------------------- |
   | GitHub-Releases update check    | `network.updateChecks`  | `services/updater.ts`       |
   | Model weights from Hugging Face | `network.modelDownload` | `services/ai/downloader.ts` |

   Both `false` ⇒ zero network. Neither scope can reach the other's hosts, so a bug
   in one cannot borrow the other's permission. Both run only in the **main**
   process; the renderer CSP stays `connect-src 'self'` — keep it that way.

   **Any new remote request must go through `session.fetch` on a guarded
   partition**, never Node's `https`/`fetch` and never a library's own downloader:
   those bypass `webRequest` entirely, so the allowlist, the gate and the network
   log all stop applying while everything still appears to work.

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
src/core/      System-agnostic. types, Zod config schema, coercion, tolerant
               parsing (stringy lists + dates), auto-mapping, completion,
               conditions + decorations, the keyboard action registry
               (actions.ts, shortcuts.ts), navigation, config summary,
               ai/ (the finding contract, prompt, model table, queue policy),
               adapter interfaces + registry, CSV adapter, IpcApi.
src/main/      Electron main (Node ESM): window, CSP, nativeTheme, config-service,
               coordinator (parse→coerce→auto-map→export), session-store,
               settings-store, network-log, updater (electron-updater; pure
               event→status mapping in update-status.ts), ai/ (model download,
               utilityProcess inference engine, analysis queue), IPC handlers.
src/preload/   contextBridge exposing `window.api` (typed via IpcApi).
src/renderer/  React 19 UI: chrome bars, category cards, recursive input formatters,
               controlled-widget output form, settings pane, Zustand store.
               Imports from @core only.
```

Data flow: `SourceAdapter.parse` → `RawRecord[]` (with opaque provenance) →
core `coerce` per `ValueType` → `LabeledRecord` (input + label values) → user labels
in renderer → on Done, `SinkAdapter.serialize` writes `*-output.*` (complete records)
and `*-remaining.*` (unlabeled/incomplete records, re-emitted from provenance).

`*-remaining.*` is **value-faithful, not byte-faithful**: values, column order and
the detected dialect round-trip exactly (property-tested in `csv.test.ts`), but
incidental formatting — BOM, header whitespace, original quoting style, blank
lines, trailing newline — does not. It must stay re-loadable as input, which is
what Prepare's join flow depends on.

## Commands

| Task              | Command                                                               |
| ----------------- | --------------------------------------------------------------------- |
| Dev (HMR)         | `pnpm dev`                                                            |
| Typecheck         | `pnpm typecheck` (node + web projects)                                |
| Lint              | `pnpm lint` / `pnpm lint:fix`                                         |
| Format            | `pnpm format` / `pnpm format:check` (oxfmt)                           |
| Test (all)        | `pnpm test` · node only: `pnpm test:node` · dom only: `pnpm test:dom` |
| Emit JSON Schema  | `pnpm schema`                                                         |
| Validate a config | `pnpm validate <file>` (same loader the app uses; exits non-zero)     |
| Docs site         | `pnpm -C docs install` · `pnpm -C docs dev` · `pnpm -C docs build`    |
| Screenshots       | `pnpm build && pnpm -C docs screenshots` (macOS; commits PNGs)        |
| Build app         | `pnpm build`                                                          |
| Package mac/win   | `pnpm build:mac` / `pnpm build:win` (local: build + package)          |
| Publish (CI)      | `pnpm package:mac` / `pnpm package:win` (package prebuilt `out/`)     |

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

## Docs (`docs/` → https://mlabel.vlad.gg)

Astro Starlight, a **standalone package with its own lockfile** — deliberately _not_ a pnpm
workspace member, because `.npmrc` pins `node-linker=hoisted` for electron-builder and
hoisting Astro's Vite beside the app's is an avoidable source of breakage. Deploys from
`main` on changes to `docs/**`, `schema/**` or `src/core/config/**`.

Generated, never hand-edited: `docs/src/content/docs/reference/**` (from
`schema/mlabel.schema.json`), `docs/public/mlabel.schema.json`, `dist/llms*.txt`. All are
gitignored. Screenshots under `docs/src/assets/shots/` **are** committed — capturing needs a
built app on macOS, which the Ubuntu Pages runner can't do.

**When you change anything under `src/core/config/`:**

1. Put author-facing prose in `.meta({ description })`, not only JSDoc. Descriptions reach
   editor hovers, the JSON Schema and the generated reference; a JSDoc comment reaches none.
2. Give any new reusable shape `.meta({ id, title })` so it lands in `$defs` under a stable
   name, and add it to `PAGE_ORDER` in `docs/scripts/generate-reference.ts` — the generator
   **throws** if a named schema has no page.
3. Run `pnpm schema` and commit. `json-schema.test.ts` compares the committed file against
   what the code emits (as parsed JSON, not bytes — oxfmt reformats it afterwards).
4. Run `pnpm -C docs build`. `scripts/docs-examples.test.ts` re-validates every complete
   config example on the site; fragments containing `…` are skipped.

## Two things that look like details and are not

- **Keyboard behaviour is data, not an if-chain.** `src/core/actions.ts` holds every
  action, its guard, its dispatch order and whether it consumes the keystroke; the
  renderer hook only touches the DOM and performs the action. `ShortcutProvider`
  resolves defaults against the labeler's overrides, and the help dialog, the choice
  hints and the toolbar all read from it — so a rebinding shows up everywhere at once.
  `preventDefault` is per-action on purpose: the arrows must keep scrolling the input
  pane while they also move through records.
- **The config is a floor for network, never a ceiling.** `effectiveUpdateChecks`
  (`src/core/network-prefs.ts`) is the single expression of that rule, with one call
  site in `config-service` and one in the `setSettings` handler. A labeler preference
  can narrow what a config permits and can never widen it.
- **A model suggestion is a guess, and must never look like anything else.**
  `src/core/ai/` produces findings; nothing on the export path imports it, so a
  finding cannot reach the output file — the same structural guarantee display rules
  have. On screen the difference is carried by `Decoration.source`: an authored rule
  gets a solid rail, the model a dashed one plus an icon and an `sr-only` prefix, and
  `toneOf` prefers an authored tone so a guess cannot recolour a field the config
  author already styled. There is deliberately no control that turns a suggestion
  into an answer.

## Gotchas

- **Dates are read and displayed as UTC**, including values that name no zone. That is
  what keeps `hasTimeOfDay` exact (a local 17:00 in California _is_ UTC midnight) and
  what makes exports machine-independent. Both Vitest projects pin
  `TZ=America/Los_Angeles`, because a UTC CI box hides this entire class of bug.
- Preload must be unsandboxed `.mjs` for ESM; drag-drop file paths come from
  `webUtils.getPathForFile` (the old `File.path` was removed).
- Windows `titleBarOverlay` only works with `titleBarStyle:'hidden'`; keep its colors
  synced to the active theme via `nativeTheme`.
- `base:"./"` (relative) is required so renderer assets load under `file://` in the
  packaged app; prefer imported assets over `public/`.
- pnpm needs `node-linker=hoisted` (in `.npmrc`) for electron-builder.
- `electron-updater` must stay **external** (listed in `electron.vite.config.ts`
  `nodeExternals`) and in `package.json` `dependencies` so it ships in the asar —
  bundling it breaks updates. Updates need a packaged build (`app.isPackaged`); they
  no-op in dev.
- oxfmt is beta and the sole formatter: if it ever blocks a commit, bypass once with
  `--no-verify` and fix — never silently disable the hook.
- **`node-llama-cpp` is imported in exactly one file** — `services/ai/worker.ts`,
  which runs as a forked `utilityProcess`. It must stay in `nodeExternals` and in
  `dependencies`, and its binaries must be `asarUnpack`ed: `**/*.node` is **not**
  sufficient, because the macOS prebuild also ships `.dylib`/`.so` companions that
  `dlopen` cannot read from inside an asar. It cannot cross-compile, so the
  arm64-only macOS runner means AI is arm64-only on mac (`isPlatformSupported`).
- **Babel stays on 7.x** — `babel-plugin-react-compiler@1.0.0` has no Babel 8 support;
  plan is to drop Babel entirely once React's Rust compiler port ships in `plugin-react`
  (do not migrate to Babel 8 in between). **Electron 43 held deliberately** — revisit at
  43.0.1+; 42.x receives patches until ~Oct 2026.
