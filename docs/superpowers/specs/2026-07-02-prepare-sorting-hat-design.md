# Prepare Screen — "Sorting Hat" Flow Redesign

**Date:** 2026-07-02
**Status:** Approved direction (mockups iterated in `.superpowers/brainstorm/`); spec pending user review.
**Supersedes:** the uncommitted `PrepareTaskMap` / `PrepareDropSurface` iteration currently in the working tree.

## Context

The Prepare screen currently stacks four bordered zones (mode buttons, drop surface,
data-contract row, operation panel) that all serve one task, with duplicated copy
("Drop source file to split" above "No source file selected — drop a source file in
the drop zone above"). The mode selection is invisible as a *choice* because the
default state is an unnamed auto-detect null.

Approved direction: **drop-first flow**. The user drops (or browses) files, MLabel
analyzes them and *proposes* an operation, the user confirms, then completes the
remaining steps. One unified card; no persistent mode picker.

## UX specification

The screen is: header + **one card** + card footer. Header keeps `useHeadingFocus`.

- **Header:** `Prepare data` / subtitle: *"Split a source file into parts for your
  labelers, or merge their finished work back together."*
- **Card footer (all stages):** `Data contract · {N} input fields → {M} output fields`
  (counts from the loaded config, as today) with a `Details` disclosure that expands
  the existing input/output schema grid (current `DataContract` content) inside the
  card, above the footer.
- The **entire card** is a drag-drop target in every stage (semantics per stage below).

### Stage 1 — Idle

Big dashed drop zone filling the card body:

- Glyph + **"Drop files here"** + *"MLabel reads them and proposes the right
  operation — splitting a source, joining labeled outputs, or joining unfinished
  remainders."*
- `Browse files…` outline button (generic, mode-agnostic). Clicking anywhere on the
  drop zone also opens the browser dialog.
- No operation tiles, no mode picker, nothing else.

### Stage 2 — Confirm (always shown after files arrive)

- Header row: **"N files ready — confirm the operation"**, full file names listed
  beneath, `✕` (start over → Idle).
- Three tiles (`Split source` / `Join outputs` / `Join remaining`), each showing:
  validity chip (`Valid` / `N errors` / `N warnings`), file count, total rows, and a
  short message when relevant (e.g. "Would split batch-a-output.csv only · ignores
  1 file"). Tiles are a radiogroup; clicking selects.
- The heuristic winner is pre-selected with a **Recommended** tag.
- Primary action: **"Continue with {operation} →"** (disabled until a tile is
  selected, which only happens when there is no recommendation).
- **Behavior change vs today:** confident cases (e.g. two `*-output` files) no
  longer skip the resolver — the confirm gate always appears, pre-resolved.

**Recommendation heuristic** (deterministic, in order):

1. Every dropped file's name hints the same join kind (`…-output` / `…-remaining`,
   part suffixes allowed) → that join operation.
2. Exactly one file, no join hint → Split source.
3. Otherwise, if exactly one operation analyzes `ok` → that operation.
4. Otherwise → no recommendation; tiles start unselected and Continue is disabled
   until the user picks one (an invalid pick is allowed — configure shows the errors).

### Stage 3 — Configure & run

Common chrome: top row with an accent operation chip (`✂ Split source`), a
`Change ▾` chip (returns to Confirm with the same paths/analyses), and `✕`
(start over → Idle). No other panel header. Section labels are small uppercase
eyebrows only (`Source`, `Partition`, `Files`, `Validation`) — the numbered
"Step 1/2/3" titles are gone.

**Split source:**

- `Source` — file row: full name, full path, row count, validity chip. No per-row
  remove (card-level `✕` covers it). Dropping a file here **replaces** the source.
- `Partition` — summary line ("130 rows → 4 contiguous part files, written next to
  the source."), stepper (− / count input / +), and the **chunk map**: one discrete
  block per part, widths proportional to row counts, alternating accent fill tones,
  rounded with gaps; each block shows `Part N`, `NN rows`, and the **full output
  file name** (e.g. `survey-responses-part1-of-4.csv`).
- Run: `✂ Split into N files` (right-aligned; gated on validity as today).

**Join outputs / Join remaining** (same layout, `kind` prop):

- `Files` — eyebrow + `+ Add files…` (existing `pickJoinFiles(kind)`); file rows with
  full name/path, row count, validity chip, per-row `✕` remove. Removing the last
  file returns to Idle. Dropping files here **adds** them to the set.
- `Validation` — cross-file `IssueList` when present + three stat pills
  (Files / Rows / Duplicates, warning tone when duplicates > 0).
- Run: `▦ Join N files…` (gated as today: any invalid file or cross-file error blocks).

**Results & errors:** unchanged mechanics — errors render inline in the card body;
successful runs render `PrepareResultList` (with reveal buttons) below the run
section. The card `✕` resets everything.

**Drop semantics per stage:** Idle → open Confirm with dropped paths. Confirm →
union new paths with current ones, re-analyze, stay in Confirm (recommendation
recomputed). Configure-join → add to file set. Configure-split → replace source.

### Accessibility

- On every stage transition, focus moves to the stage's heading (reuse the
  `useHeadingFocus` pattern within the card).
- Confirm tiles: `role="radiogroup"` with `aria-checked` per tile.
- Busy/error announcements keep the existing live-region behavior.
- Icons remain `aria-hidden`; chips carry text, not color alone (AA contrast gate).

## Architecture

### Store (`src/renderer/src/store/prepare-store.ts`) — stage machine

Replaces `tab` + `selectedAction` + `pendingDrop` with one discriminated union:

```ts
type PrepareOp = "split" | "join-output" | "join-remaining";

interface OpProposal {
  op: PrepareOp;
  ok: boolean;
  fileCount: number;
  totalRows: number;
  errors: number;
  warnings: number;
  message?: string;
  // retained raw analysis so Confirm→Configure needs no re-analysis:
  split?: SplitAnalyzeResponse;
  join?: JoinAnalyzeResponse;
}

type PrepareStage =
  | { kind: "idle" }
  | {
      kind: "confirm";
      paths: string[];
      proposals: OpProposal[];
      recommended: PrepareOp | null;
      selected: PrepareOp | null; // initialized to `recommended`
    }
  | { kind: "configure"; op: PrepareOp };
```

`SplitState` and `Record<JoinKind, JoinState>` data slices stay as-is; `confirmOp()`
populates them from the retained analysis responses (`buildDropResolution` currently
discards them — the new builder keeps them).

Actions: `addPaths(paths)` (drop or browse → analyze all three ops → Confirm),
`browseFiles()` (generic picker → `addPaths`), `selectOp(op)`, `confirmOp()`,
`changeOp()` (Configure → Confirm, analyses retained), `resetFlow()` (→ Idle),
plus the existing configure-stage actions (`setSplitParts`, `runSplit`,
`pickJoinFiles`, `removeJoinFile` — now returning to Idle when the list empties —
`runJoin`, `analyzeSplitPath` for split-drop-replace) and `reset()`.

Dead code removed by this shape: `setTab`, `setSelectedAction`,
`addDroppedPathsToTab`, `resolvePendingDrop`, `clearPendingDrop`, and the
`PrepareTaskMap` `getState()`-in-render + `void split; void join;` hack (component
deleted). Every drop now runs all three analyses (previously only ambiguous drops
did); accepted cost — parsing stays in the main process and files are local.

### IPC (`src/core/ipc.ts` + main + preload)

One addition — a mode-agnostic multi-select picker (dialog only, no analysis):

```ts
pickPrepareFiles: () => Promise<PrepareFilePickResponse>; // { canceled, paths }
```

Channel `prepare:files-pick`; handler in `src/main/ipc.ts` beside the existing
prepare handlers; exposed through the preload bridge like its siblings.

### Core (`src/core/`)

Move the part-file *naming pattern* to core as a pure helper so the renderer's chunk
map and main's writer share one source of truth (golden rule #5):

```ts
// src/core/prepare-names.ts (pure string logic, no node:path)
partFileNames(sourcePath: string, parts: number): string[] // basenames only
```

`src/main/services/prepare-naming.ts#splitTargetPaths` becomes
`dir + partFileNames(...)`; its existing tests pin the pattern and must keep passing.
Core stays Electron-free; the helper does its own extension/stem parsing.

### Components (`src/renderer/src/prepare/`)

| File | Fate |
| --- | --- |
| `PrepareView.tsx` | Shell: header + stage switch + card + contract footer |
| `PrepareTaskMap.tsx` | **Deleted** (never committed) |
| `PrepareDropSurface.tsx` | **Deleted**; drop handling moves to the card; resolver becomes ConfirmStage |
| `PrepareOperationPanel.tsx` | **Deleted**; replaced by card chrome + eyebrow labels |
| `IdleStage.tsx` | New: drop zone + browse |
| `ConfirmStage.tsx` | New: file list + proposal tiles + continue |
| `SplitConfigure.tsx` | From `SplitPanel`: chip row, source, partition + `ChunkMap`, run |
| `JoinConfigure.tsx` | From `JoinPanel` (`kind` prop): chip row, files, validation, run |
| `ChunkMap.tsx` | New: discrete proportional blocks with full output names |
| `FileStatusRow.tsx`, `PrepareResultList.tsx`, `IssueList` | Kept as-is |

`app.tsx` integration is unchanged (mode toggle via menu → `PrepareView`); its test
copy assertions update to the new idle-stage strings.

## Testing

- **Core (TDD, node project):** `partFileNames` — red/green first; cases: plain,
  re-split of an existing part (suffix stripped, matching `splitTargetPaths`
  behavior), multi-dot names, no-extension names.
- **Store (node project):** heuristic recommendation (all-output hint, all-remaining
  hint, single unhinted file, mixed → unique-valid, mixed → none); stage
  transitions (idle→confirm→configure, changeOp retains proposals, resetFlow,
  remove-last-join-file → idle, drop semantics per stage); confirmOp uses retained
  analyses (assert no extra `analyze*` IPC calls).
- **Main:** existing `prepare-naming.test.ts` unchanged and green after the core
  extraction; new `pickPrepareFiles` handler test beside existing picker tests.
- **DOM:** stage rendering per store state; tile radiogroup semantics + Recommended
  preselection; chunk map shows full filenames and proportional sizing attributes;
  confirm-gate flow (drop → tiles → continue); updated `app.test.tsx` /
  `PrepareView.test.tsx` copy.

## Out of scope

Labeling mode, adapters, config schema, updater, theme tokens, and any IPC beyond
`pickPrepareFiles`. No changes to `src/core/` beyond the naming helper.

## Post-implementation cleanup

Per project convention: delete `docs/superpowers/` specs/plans and
`.superpowers/` (mockups) once the implementation lands.
