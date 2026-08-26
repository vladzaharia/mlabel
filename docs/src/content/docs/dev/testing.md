---
title: Testing
description: The two Vitest projects, the TDD rule, property tests and golden files.
sidebar:
  order: 7
---

```bash
pnpm test        # everything
pnpm test:node   # pure logic
pnpm test:dom    # components
pnpm test:watch
```

## Two projects

| Project | Environment | Covers                                                 |
| ------- | ----------- | ------------------------------------------------------ |
| `node`  | node        | `src/{core,main}/**/*.test.ts`, `scripts/**/*.test.ts` |
| `dom`   | happy-dom   | `src/renderer/**/*.test.{ts,tsx}`                      |

Tests are co-located with what they test. The split exists so pure logic runs without a DOM
and stays fast — the node project is most of the suite and finishes in about a second.

## TDD is the rule for `core` and `main`

Red, green, refactor. Write the failing test first.

This is not ceremony here: nearly every non-obvious behaviour in those layers exists because
something went wrong once, and the test is what stops it coming back. The comments in the
source name those failures deliberately — "committing first left a rejected document in main
state", "a `Date` left as an ISO string and came back a string". Each of those is a test.

## Fixtures describe intent, not shape

`test/fixtures/config.ts` is the one place tests describe a config, and its specs are
**semantic**:

```ts
configObject({ output: [{ name: "verdict", kind: "choice", choices: ["good", "bad"] }] });
```

not `control: radio` with options. The indirection is deliberate: when the schema changes,
only the serializers in the fixture move, and the twenty-odd test files using it stay put.
The v2 schema rewrite is what proved this out.

Break a valid config in exactly one way with the `tweak` helper, rather than string-replacing
JSON:

```ts
const bad = tweak({}, (c) => {
  c.output.fields[0].fill = { kind: "copy", from: "nope" };
});
expect(all(bad)).toContain("nope");
```

## Property tests

`fast-check`, via `@fast-check/vitest`. The important one is the CSV round-trip: generate an
arbitrary document, parse, re-emit, parse again, assert the two agree. That is what pins the
value-faithful contract `*-remaining` depends on — see [Writing an adapter](/dev/adapters/).

Reach for a property test when the invariant is "these two operations are inverses" or "this
holds for every input", rather than enumerating examples.

## Golden files

The export integration test byte-compares against `examples/output.golden.csv`. This is why
`stampLabelTime` takes `now` as a parameter rather than reading the clock inline — a wall
clock would make the golden file unpinnable.

Any function whose output must be reproducible should take its non-determinism as an
argument.

## Purity as a testing strategy

The recurring pattern in `src/main/` is a thin Electron-aware shell over a pure module:

| Shell                | Pure core             |
| -------------------- | --------------------- |
| `coordinator.ts`     | `pipeline.ts`         |
| `prepare-service.ts` | `prepare-pipeline.ts` |
| `network-guard.ts`   | `network-policy.ts`   |
| `updater.ts`         | `update-status.ts`    |
| `menu.ts`            | `buildMenuTemplate`   |

The pure half gets thorough unit tests with no Electron, no temp directories and no mocking.
Follow it when adding a service — if something is hard to test, the split is usually in the
wrong place.

## Docs examples are tested too

`scripts/docs-examples.test.ts` extracts every complete `jsonc` config from the
documentation and runs it through `loadConfig`. Fragments — anything containing `…` — are
skipped rather than failed.

Documentation examples rot silently otherwise: nobody runs the config in a code fence, and a
schema change leaves the site confidently telling people to write something the app now
rejects.

## Other gates

| Command                | Checks                                               |
| ---------------------- | ---------------------------------------------------- |
| `pnpm lint`            | oxlint, including the adapter-internals import fence |
| `pnpm format:check`    | oxfmt                                                |
| `pnpm typecheck`       | tsc over both the node and web projects              |
| `pnpm audit:contrast`  | WCAG contrast across every tone in every palette     |
| `pnpm validate <file>` | A config, using the same loader the app uses         |

`json-schema.test.ts` asserts the committed `schema/mlabel.schema.json` matches what the code
emits — comparing **parsed JSON, not bytes**, because oxfmt reformats the file after
emission. If it fails, run `pnpm schema`.

`schema-agreement.test.ts` pins the property the published schema actually promises: **it
must never reject a config the app accepts.** The docs tell authors to trust the squiggles,
so a schema stricter than the loader is the damaging failure — it marks correct configs as
broken. The reverse gap is fine and expected: JSON Schema cannot express the cross-field
checks, so it accepts some configs `loadConfig` rejects.

This caught a real bug. `"display": "Some title"` is expanded by the loader _before_ Zod
runs, so the emitted schema knew only the object form and rejected the project's own example
config six times over.

CI runs lint, format, typecheck and test as a parallel matrix, plus a build.

## Hooks

lefthook runs oxfmt and oxlint on staged files pre-commit, and typecheck plus the full suite
pre-push.

:::caution
oxfmt is beta and the sole formatter. If it ever blocks a commit, bypass once with
`--no-verify` and fix the cause — never silently disable the hook.
:::
