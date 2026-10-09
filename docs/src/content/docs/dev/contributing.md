---
title: Contributing
description: Install development dependencies, choose the right checks, and maintain the app and documentation.
sidebar:
  order: 9
---

Requires [Node 22+](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev          # the app, with hot reload
```

## Commands

| Task                 | Command                                          |
| -------------------- | ------------------------------------------------ |
| Dev (HMR)            | `pnpm dev`                                       |
| Typecheck            | `pnpm typecheck`                                 |
| Lint / fix           | `pnpm lint` · `pnpm lint:fix`                    |
| Format / check       | `pnpm format` · `pnpm format:check`              |
| Test                 | `pnpm test` · `pnpm test:node` · `pnpm test:dom` |
| Emit the JSON Schema | `pnpm schema`                                    |
| Validate a config    | `pnpm validate <file>`                           |
| Contrast audit       | `pnpm audit:contrast`                            |
| Build                | `pnpm build`                                     |
| Package locally      | `pnpm build:mac` · `pnpm build:win`              |

## Non-negotiables

These are in `CLAUDE.md`, and they are the ones that actually get enforced:

1. **Zero unsolicited network.** The update check is the only exception, gated by config.
2. **`src/core/` is format-agnostic.** No Electron, no adapter internals.
3. **Adapter internals stay private** behind the opaque provenance token — enforced by lint.
4. **Heavy work in main.** The renderer is presentation-only.
5. **TDD for `src/core/` and `src/main/`.**

See [Architecture](/dev/architecture/) for what each one buys.

## Conventions

- **ESM everywhere.** `verbatimModuleSyntax` is on, so always `import type` for type-only
  imports. `moduleResolution: bundler`.
- **Main is ESM**: no `__dirname`; use `import.meta.url` / `fileURLToPath`.
- **Aliases**: `@core/*` → `src/core/*`, `@/*` → `src/renderer/src/*`. Mirror any change
  across `tsconfig.base.json`, `electron.vite.config.ts` and `vitest.config.ts`.
- **React 19 + compiler is on** — do not hand-write `useMemo`/`useCallback` for new code
  unless profiling demands it.
- **Tailwind v4 is CSS-first.** There is no `tailwind.config.js`.
- **pnpm needs `node-linker=hoisted`** (in `.npmrc`) for electron-builder.

## Changing the config schema

The schema is the app's public interface, so a change there ripples further than most:

1. **Write the test first** in `src/core/config/schema.test.ts` or `json-schema.test.ts`.
2. **Put prose in `.meta({ description })`**, not only in a JSDoc comment. Descriptions reach
   editor hovers, the JSON Schema, and the generated reference pages — a JSDoc comment
   reaches none of them.
3. **Give any new reusable shape a `.meta({ id, title })`**, so it lands in `$defs` under a
   stable name rather than an anonymous `__schemaN`. Add it to `PAGE_ORDER` in
   `docs/scripts/generate-reference.ts` — the generator **throws** if a named schema has no
   page, so this is caught rather than silently skipped.
4. **Run `pnpm schema`** and commit the regenerated file. A test compares the committed copy
   against what the code emits.
5. **Check the docs.** `pnpm -C docs build` regenerates the reference;
   `scripts/docs-examples.test.ts` re-validates every complete example on the site.

## The docs site

Lives in `docs/`, and is a **separate package with its own lockfile** — deliberately not a
workspace member, because the root `.npmrc` pins `node-linker=hoisted` for electron-builder
and hoisting Astro's Vite next to the app's would be an avoidable source of breakage.

```bash
pnpm -C docs install
pnpm -C docs dev          # localhost:4321
pnpm -C docs build
pnpm -C docs screenshots    # needs `pnpm build` first
pnpm -C docs field-previews # individual controls and Settings, both themes
pnpm -C docs cookbook-shots # runnable recipes, their UI, and exports
pnpm -C docs tutorial-shots # the beginner project and completion screen
pnpm -C docs check:browser  # rendered site, with a local preview running
```

What is generated and what is written by hand:

| Path                             | Source                                            |
| -------------------------------- | ------------------------------------------------- |
| `src/content/docs/reference/**`  | **Generated** from `schema/mlabel.schema.json`    |
| `public/mlabel.schema.json`      | **Copied** from `schema/` at build                |
| `dist/llms.txt`, `llms-full.txt` | **Generated** after build                         |
| `src/assets/shots/**`            | Captured by `pnpm -C docs screenshots`, committed |
| Everything else                  | Hand-written                                      |

The capture commands open maximized app windows and use isolated sample data. They
require macOS and leave your normal session untouched. Commit the resulting PNGs when
the interface changes.

Never edit anything under `reference/` — it is deleted and rewritten on every build.

Deployment is automatic: pushing to `main` with changes under `docs/`, `schema/` or
`src/core/config/` publishes to <https://mlabel.vlad.gg>.

## Writing documentation

Lead with the reader’s task, then show the result before the configuration. Keep operational steps in role guides, runnable examples in the cookbook, and exhaustive key details in the generated reference.

When adding a cookbook recipe, include a complete config and CSV under `docs/public/examples/cookbook/`, a screenshot pair of that exact example, and an export or visual check readers can repeat. Add the capture scenario to `docs/scripts/cookbook-screenshots.ts`. Do not substitute a similar-looking field from another example.

Keep existing routes working when consolidating pages. Check section links after moving content, and review both themes at narrow widths.

## Pull requests

CI runs lint, format, typecheck, test and a build as a parallel matrix, plus a docs build.
Run the same locally before pushing — lefthook already runs typecheck and tests pre-push.

Keep commits focused. If you find an unrelated problem, say so rather than folding the fix
in.
