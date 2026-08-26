---
title: Architecture
description: The four layers, the rules that keep them separate, and how data flows from file to export.
sidebar:
  order: 1
---

```
src/core/      System-agnostic. Types, the Zod config schema, coercion, fill
               resolution, completion, adapter interfaces + registry, the CSV
               adapter, and the IPC contract.
src/main/      Electron main (Node ESM): window, CSP, theme, config service,
               coordinator (parse → coerce → resolve → export), session store,
               updater, IPC handlers.
src/preload/   contextBridge exposing `window.api`, typed by the IPC contract.
src/renderer/  React 19 UI. Imports from @core only.
```

## The five rules

Everything about the layout follows from these.

### 1. Zero unsolicited network

No `fetch`, no telemetry, no remote calls anywhere — with exactly one exception, the
GitHub-Releases update check. It runs only in **main**, is gated by `network.updateChecks`
in the loaded config, and starts only after a permitting config loads. The renderer's
content policy stays `connect-src 'self'`; update traffic is Node-side and never reaches
the window.

### 2. The core is format-agnostic

`src/core/` must never depend on Electron or on any adapter's internals. CSV is just the
first adapter. Adding a format must require **no changes** to `src/core/` (beyond
registering it), the renderer, or the config schema.

### 3. Adapter internals stay private

Format specifics — CSV raw bytes, BOM, delimiter — live behind an opaque `ProvenanceToken`
inside that adapter's folder. Nothing outside may import its internal types, and an oxlint
`no-restricted-imports` rule enforces it rather than trusting anyone to remember.

### 4. Heavy work runs in main

Parsing, validation, coercion and file I/O happen in `src/main/`. The renderer is
presentation-only and talks to main through the typed IPC contract.

### 5. One source of truth per concern

The Zod config schema, the value-type union, and the IPC interface each have exactly one
definition, in `src/core/`.

## Data flow

```
                    ┌─────────────── main ───────────────┐
file ──▶ SourceAdapter.parse ──▶ RawRecord[]             │
                    │             (opaque provenance)    │
                    │                    │               │
                    │              core coerce           │
                    │            (per ValueType)         │
                    │                    ▼               │
                    │              RecordView[] ─────────┼──▶ renderer
                    │                                    │      │
                    │                                    │   user labels
                    │                                    │      │
                    │       ┌────── ExportRequest ◀──────┼──────┘
                    │       ▼                            │
                    │  merge labels + session + stamp    │
                    │       │                            │
                    │       ├─ complete ──▶ SinkAdapter.serialize ──▶ *-output.*
                    │       └─ incomplete ─▶ SourceAdapter.reemit ──▶ *-remaining.*
                    └────────────────────────────────────┘
```

Provenance is what makes the second branch possible. Each `RawRecord` carries an opaque,
adapter-owned handle; only the adapter that created it can decode it, which is how
unfinished rows are re-emitted in their original shape without the core knowing anything
about CSV.

## Why `*-remaining` is value-faithful, not byte-faithful

Values, column order and the detected dialect round-trip exactly — property-tested by
parsing, re-emitting and parsing again. Incidental formatting does not: BOM, header
whitespace, original quoting style, blank lines, trailing newline.

The contract it must honour is that the file **stays loadable as input**, because Prepare's
join flow depends on it. Byte fidelity was never the requirement, and pursuing it would have
pushed format detail up into the core.

## Aliases

`@core/*` → `src/core/*`, `@/*` → `src/renderer/src/*`. Mirror any change across
`tsconfig.base.json`, `electron.vite.config.ts` and `vitest.config.ts`.

## Where to go next

- [The core](/dev/core/) — module by module.
- [Main process](/dev/main/) — services and their invariants.
- [Renderer](/dev/renderer/) — stores and registries.
- [IPC](/dev/ipc/) — the three-layer contract.
- [Writing an adapter](/dev/adapters/) — adding a format.
