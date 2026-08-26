---
title: Renderer
description: Stores, the widget and formatter registries, keyboard handling and accessibility.
sidebar:
  order: 4
---

The renderer is presentation-only: React 19 with the compiler on, Tailwind v4, Radix
primitives. It imports from `@core` and calls `window.api`. An oxlint rule blocks it from
importing Electron, adapters, or anything under `main/`.

## Stores

Two Zustand stores.

**`store.ts`** holds the labeling flow: phase, config, records, labels, session answers,
index, update status. Phases are `boot → need-config → need-input → need-prefill →
labeling → done`, plus `config-invalid`, `input-invalid` and `prepare`.

**`prepare-store.ts`** holds Prepare's stages: `idle → confirm → configure`. Kept separate
because Prepare shares almost nothing with labeling beyond the loaded config.

### Autosave is a subscriber

Not a call scattered through actions — one `useStore.subscribe` that bails unless something
session-relevant actually changed:

```ts
if (state.labels === prev.labels && state.prefill === prev.prefill && state.index === prev.index …) return;
```

The same pattern keeps the native menu in sync. Both fire only on real changes, so unrelated
state (theme, update status) costs no IPC.

## Two registries

**Formatters** (`input/`) render a `CoercedValue` for display, dispatching on the declared
type. Composite types recurse: an `array` of `object` becomes a table, a `map` becomes a
keyed table.

**Widgets** (`output/widgets.tsx`) capture a value, dispatching on type + widget. `WidgetProps`
is generic over the type kinds a widget handles, so a number widget reads `field.min` without
a cast — the discriminated union narrows it, and the registry has already guaranteed the
pairing.

Adding a widget means adding it to `WIDGETS_BY_TYPE` in the core and to the registry here.
The schema then permits it structurally.

## Keyboard

`useKeyboardShortcuts` is a single window listener. Three ideas carry it:

**An open modal owns the keyboard.** It bails on `[role="dialog"][data-state="open"]`.
Without that guard the resume prompt was live-fire — digits wrote labels to the record
behind it, and ⌘Enter exported _and_ cleared the very session the dialog was asking about.

**`typing` and `textEntry` are different.** `typing` covers anything that consumes
keystrokes, including sliders and radio groups. `textEntry` is narrower: only where a
_letter_ means "insert this letter". Bare chords are held back by `textEntry`, which is why
they keep working while a radio group or slider has focus.

**Modifier chords are matched before the typing guard**, so `mod+`-style accelerators stay
reachable from inside a text field.

`ENTER_IS_TAKEN` lists the elements where Enter already means something — a focused button,
an open select, a textarea — so advancing the record never double-fires.

## Accessibility

- **`LiveAnnouncer`** plus `announce()` for phase changes and outcomes, polite or assertive.
- **`useHeadingFocus`** moves focus to the `h1` on view change, so assistive tech reads the
  new context rather than announcing it separately.
- **Shortcut badges are decorative** (`aria-hidden`) with `aria-keyshortcuts` carrying the
  same chord spelled the way ARIA wants it — `Meta+V`, not `⌘V`, which a screen reader
  would read as punctuation or skip.
- **Tones are contrast-audited.** `pnpm audit:contrast` runs the full pair matrix over the
  real stylesheet across all palettes, and it is a CI gate.

## Styling

Tailwind v4, CSS-first: `@import "tailwindcss"`, `@theme`, `@custom-variant`. There is no
`tailwind.config.js`.

Tones map to token pairs rather than fixed colours, which is what keeps the contrast gate
meaningful and both themes legible.

:::note
React 19 with the compiler enabled — **do not hand-write `useMemo`/`useCallback`** for new
code unless profiling demands it.
:::

## Conventions

- `base: "./"` (relative) is required so renderer assets load under `file://` in a packaged
  build. Prefer imported assets over `public/`.
- Component tests live in the `dom` Vitest project with happy-dom.
- `components/ui/**` is generated primitive wrappers and is excluded from lint and coverage.
