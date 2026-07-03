# Prepare Screen "Sorting Hat" Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Prepare screen's mode-picker + drop-surface layout with a drop-first flow: one card, three stages (Idle → Confirm → Configure), heuristic operation proposal with an always-on confirm gate, and a chunk-style partition map showing real output filenames.

**Architecture:** The Zustand prepare-store becomes a stage machine (`idle | confirm | configure`) that retains all three analysis responses from the confirm stage so Continue never re-analyzes. Part-file naming moves to a pure `src/core/prepare-names.ts` helper shared by the renderer's ChunkMap and main's writer. One new IPC method (`pickPrepareFiles`) adds a mode-agnostic file picker.

**Tech Stack:** Electron 42 / React 19 (Compiler on — no manual memo) / Zustand / Tailwind v4 / Vitest (node + dom projects, happy-dom) / Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-02-prepare-sorting-hat-design.md`

**Execution context notes:**

- Work happens in the **current working tree** (not a fresh worktree): the redesign builds on uncommitted files (`PrepareResultList.tsx` is untracked and kept). Task 1 commits that baseline first.
- **Transient typecheck breakage is expected between Tasks 5 and 9**: the store rewrite (Task 5) breaks the old `PrepareView`/`SplitPanel`/`JoinPanel`/`PrepareTaskMap`/`PrepareDropSurface` until Task 9 replaces/deletes them. Per-file tests stay green at each commit; `pnpm typecheck` is only required to pass from Task 9 on. The pre-commit hook only formats/lints staged files, so intermediate commits are safe. Do not push until Task 10 passes everything.
- Run dom tests as `pnpm vitest run --project dom <file>`, node tests as `pnpm vitest run --project node <file>`.

---

### Task 1: Commit the in-flight baseline

The working tree contains an uncommitted prior iteration of the Prepare screen. Commit it as-is so every later diff is clean.

**Files:** all currently modified/untracked files (git status shows 9 modified + 4 untracked, all Prepare-related plus `app.tsx`/`app.test.tsx`).

- [ ] **Step 1: Commit everything currently in the working tree**

```bash
cd /Users/vlad/Repos/data-labeler
git add -A
git commit -m "Prepare: task-map iteration (baseline before Sorting Hat redesign)"
```

Expected: commit succeeds; `git status` clean except `.superpowers/` (which is transient mockup output — if git lists it, add `.superpowers/` to `.gitignore` in this same commit).

---

### Task 2: Core `partFileNames` helper (TDD)

Pure naming logic for split part files, shared by renderer and main. Pattern must match `src/main/services/prepare-naming.ts` exactly: `data.csv × 3 → data-part1-of-3.csv…`, stripping any existing `-partN-of-M` suffix first.

**Files:**
- Create: `src/core/prepare-names.ts`
- Create: `src/core/prepare-names.test.ts`
- Modify: `src/core/index.ts` (add one `export *` line)

- [ ] **Step 1: Write the failing test**

Create `src/core/prepare-names.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { partFileNames } from "./prepare-names";

describe("partFileNames", () => {
  it("names contiguous parts from the source basename", () => {
    expect(partFileNames("/data/input.csv", 3)).toEqual([
      "input-part1-of-3.csv",
      "input-part2-of-3.csv",
      "input-part3-of-3.csv",
    ]);
  });

  it("preserves the source extension", () => {
    expect(partFileNames("/data/input.tsv", 2)).toEqual([
      "input-part1-of-2.tsv",
      "input-part2-of-2.tsv",
    ]);
  });

  it("strips an existing part suffix so re-splits don't stack", () => {
    expect(partFileNames("/data/input-part2-of-5.csv", 2)).toEqual([
      "input-part1-of-2.csv",
      "input-part2-of-2.csv",
    ]);
  });

  it("handles Windows separators and multi-dot names", () => {
    expect(partFileNames("C:\\data\\report.final.csv", 2)).toEqual([
      "report.final-part1-of-2.csv",
      "report.final-part2-of-2.csv",
    ]);
  });

  it("handles names without an extension", () => {
    expect(partFileNames("/data/input", 2)).toEqual(["input-part1-of-2", "input-part2-of-2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --project node src/core/prepare-names.test.ts`
Expected: FAIL — cannot resolve `./prepare-names`.

- [ ] **Step 3: Write the implementation**

Create `src/core/prepare-names.ts`:

```ts
/**
 * Naming pattern for split part files, shared by the renderer (chunk-map
 * preview) and the main process (actual file writer) so displayed names always
 * match written names. Pure string logic — no node:path (core is system-agnostic).
 */

/** `-partN-of-M` marker appended by splits (stripped before re-deriving names). */
export const PART_SUFFIX = /-part\d+-of-\d+$/;

function splitName(path: string): { stem: string; ext: string } {
  const name = path.split(/[/\\]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/** Basenames (no directory) of the part files a split of `sourcePath` produces. */
export function partFileNames(sourcePath: string, parts: number): string[] {
  const { stem, ext } = splitName(sourcePath);
  const base = stem.replace(PART_SUFFIX, "");
  return Array.from(
    { length: parts },
    (_, i) => `${base}-part${String(i + 1)}-of-${String(parts)}${ext}`,
  );
}
```

In `src/core/index.ts`, after the line `export * from "./prepare";` add:

```ts
export * from "./prepare-names";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --project node src/core/prepare-names.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/prepare-names.ts src/core/prepare-names.test.ts src/core/index.ts
git commit -m "core: add partFileNames — shared split naming pattern"
```

---

### Task 3: Main naming service consumes the core helper

`splitTargetPaths` keeps its signature and behavior; only its internals change. The existing test file is the regression gate — do not modify it.

**Files:**
- Modify: `src/main/services/prepare-naming.ts`
- Test (existing, unchanged): `src/main/services/prepare-naming.test.ts`

- [ ] **Step 1: Replace the implementation**

Replace the entire contents of `src/main/services/prepare-naming.ts` with:

```ts
import { basename, dirname, extname, join } from "node:path";
import type { JoinKind } from "@core";
import { PART_SUFFIX, partFileNames } from "@core";

/**
 * Deterministic split targets next to the source: `data.csv` × 3 →
 * `data-part1-of-3.csv` …; naming pattern lives in core (`partFileNames`)
 * so the renderer preview and the writer can never disagree.
 */
export function splitTargetPaths(inputPath: string, parts: number): string[] {
  const dir = dirname(inputPath);
  return partFileNames(inputPath, parts).map((name) => join(dir, name));
}

/**
 * Default save-dialog filename for a join, derived from the first input file:
 * part and `-output`/`-remaining` suffixes are stripped, then the join kind is
 * appended — `data-part1-of-3-output.csv` → `data-output-joined.csv`.
 */
export function defaultJoinFileName(kind: JoinKind, firstPath: string): string {
  const ext = extname(firstPath);
  const base = basename(firstPath, ext)
    .replace(/-(output|remaining)$/, "")
    .replace(PART_SUFFIX, "");
  return `${base}-${kind}-joined${ext}`;
}
```

- [ ] **Step 2: Run the existing tests unchanged**

Run: `pnpm vitest run --project node src/main/services/prepare-naming.test.ts`
Expected: PASS (6 tests) — proving the extraction preserved the pattern.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/prepare-naming.ts
git commit -m "main: derive split target paths from core partFileNames"
```

---

### Task 4: `pickPrepareFiles` IPC method

Mode-agnostic multi-select open dialog: returns paths only, no analysis. Wired through all three layers (core contract → preload → main handler).

**Files:**
- Modify: `src/core/types/view.ts` (new response type, after `JoinRunResponse` around line 137)
- Modify: `src/core/ipc.ts` (IpcApi method + channel)
- Modify: `src/core/index.ts` (export the type)
- Modify: `src/main/services/prepare-service.ts` (dialog function)
- Modify: `src/main/ipc.ts` (handler)
- Modify: `src/preload/index.ts` (bridge line)
- Modify: `src/renderer/src/store/prepare-store.test.ts`, `src/renderer/src/prepare/PrepareView.test.tsx`, and any other file with a `const base: IpcApi` mock (extend the mock)

- [ ] **Step 1: Add the response type**

In `src/core/types/view.ts`, directly after the `JoinRunResponse` interface:

```ts
/** Result of the mode-agnostic Prepare file picker (dialog only, no analysis). */
export interface PrepareFilePickResponse {
  canceled: boolean;
  paths: string[];
}
```

In `src/core/index.ts`, add `PrepareFilePickResponse,` to the `export type { ... } from "./types/view";` list (alphabetical: after `PrepareFileInfo,`).

- [ ] **Step 2: Extend the IPC contract**

In `src/core/ipc.ts`:

Add `PrepareFilePickResponse,` to the type import list from `"./types/view"` (after `JoinRunResponse,`).

In the `IpcApi` interface, in the Prepare section after the `analyzeSplitFile` line, add:

```ts
  /** Pick any prepare files (mode-agnostic); analysis happens via the analyze methods. */
  pickPrepareFiles: () => Promise<PrepareFilePickResponse>;
```

In `IPC_INVOKE`, after `pickSplitFile: "prepare:split-pick",` add:

```ts
  pickPrepareFiles: "prepare:files-pick",
```

- [ ] **Step 3: Implement the dialog in prepare-service**

In `src/main/services/prepare-service.ts`, add `PrepareFilePickResponse` to the type import from `@core`, and add after `pickSplitFile`:

```ts
export async function pickPrepareFiles(): Promise<PrepareFilePickResponse> {
  const result = await dialog.showOpenDialog({
    title: "Select files to prepare",
    properties: ["openFile", "multiSelections"],
    filters: DATA_FILTERS,
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true, paths: [] };
  return { canceled: false, paths: result.filePaths };
}
```

- [ ] **Step 4: Register handler and bridge**

In `src/main/ipc.ts`: add `pickPrepareFiles,` to the import from `./services/prepare-service`, and after the `pickSplitFile` handler line add:

```ts
  ipcMain.handle(IPC_INVOKE.pickPrepareFiles, () => pickPrepareFiles());
```

In `src/preload/index.ts`, after the `analyzeSplitFile` line add:

```ts
  pickPrepareFiles: () => ipcRenderer.invoke(IPC_INVOKE.pickPrepareFiles),
```

(`satisfies IpcApi` enforces this — the preload fails to typecheck until the line exists.)

- [ ] **Step 5: Extend the typed test mocks**

Find every typed mock: `grep -rln "const base: IpcApi" src/`. In each (currently `src/renderer/src/store/prepare-store.test.ts`, `src/renderer/src/prepare/PrepareView.test.tsx`, and `src/renderer/src/app.test.tsx` if it has one), add to the `base` object after `analyzeSplitFile`:

```ts
    pickPrepareFiles: async () => ({ canceled: true, paths: [] }),
```

- [ ] **Step 6: Verify**

Run: `pnpm vitest run --project node src/core/ipc.test.ts && pnpm typecheck`
Expected: ipc test PASS (channel uniqueness covers the new channel); typecheck PASS (all three layers agree).

- [ ] **Step 7: Commit**

```bash
git add src/core/types/view.ts src/core/ipc.ts src/core/index.ts src/main/services/prepare-service.ts src/main/ipc.ts src/preload/index.ts src/renderer/src/store/prepare-store.test.ts src/renderer/src/prepare/PrepareView.test.tsx src/renderer/src/app.test.tsx
git commit -m "ipc: add mode-agnostic pickPrepareFiles picker"
```

---

### Task 5: Store stage machine (test-first)

Full rewrite of the prepare store: `tab`/`selectedAction`/`pendingDrop` become one `stage` discriminated union; every path ingestion builds three retained analyses and lands in the confirm stage. **After this task the old Prepare components no longer typecheck — expected until Task 9.**

**Files:**
- Rewrite: `src/renderer/src/store/prepare-store.ts`
- Rewrite: `src/renderer/src/store/prepare-store.test.ts`

- [ ] **Step 1: Rewrite the test file (failing)**

Replace the entire contents of `src/renderer/src/store/prepare-store.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcApi, JoinAnalyzeResponse, PrepareFileInfo } from "@core";
import { usePrepareStore } from "./prepare-store";

function fileInfo(path: string, rowCount = 4, ok = true): PrepareFileInfo {
  return { path, rowCount, ok, issues: [] };
}

function joinOk(paths: readonly string[]): JoinAnalyzeResponse {
  return {
    ok: true,
    files: paths.map((path) => fileInfo(path)),
    crossFileIssues: [],
    totalRows: paths.length,
  };
}

const joinBad: JoinAnalyzeResponse = { ok: false, error: "wrong columns" };

function mockApi(overrides: Partial<IpcApi>): IpcApi {
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => false,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
    installUpdate: async () => {},
    checkForUpdates: async () => {},
    openExternal: async () => {},
    revealPath: async () => {},
    getStartupConfig: async () => ({ status: "none" }),
    pickConfig: async () => ({ status: "canceled" }),
    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: () => "",
    saveSession: async () => {},
    clearSession: async () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),
    pickSplitFile: async () => ({ ok: false, canceled: true }),
    analyzeSplitFile: async () => ({ ok: false, canceled: true }),
    pickPrepareFiles: async () => ({ canceled: true, paths: [] }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async () => ({ ok: false }),
    runJoin: async () => ({ ok: false }),
  };
  const api: IpcApi = { ...base, ...overrides };
  Object.defineProperty(window, "api", { value: api, configurable: true });
  return api;
}

/** Analyzers that accept anything: split ok on first path, joins ok on all paths. */
function permissiveAnalyzers(): {
  analyzeSplitFile: ReturnType<typeof vi.fn>;
  analyzeJoinFiles: ReturnType<typeof vi.fn>;
} {
  return {
    analyzeSplitFile: vi.fn(async (path: string) => ({ ok: true, file: fileInfo(path, 6) })),
    analyzeJoinFiles: vi.fn(async ({ paths }: { paths: string[] }) => joinOk(paths)),
  };
}

async function proposeTo(paths: string[]): Promise<void> {
  await usePrepareStore.getState().dropPaths(paths);
}

describe("prepare store stage machine", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
  });

  it("starts idle", () => {
    expect(usePrepareStore.getState().stage).toEqual({ kind: "idle" });
  });

  it("dropPaths from idle builds three proposals and enters confirm", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/a.csv", "/d/b.csv"]);

    const stage = usePrepareStore.getState().stage;
    expect(stage.kind).toBe("confirm");
    if (stage.kind !== "confirm") return;
    expect(stage.paths).toEqual(["/d/a.csv", "/d/b.csv"]);
    expect(stage.proposals.map((p) => p.op)).toEqual(["split", "join-output", "join-remaining"]);
    expect(fns.analyzeSplitFile).toHaveBeenCalledTimes(1);
    expect(fns.analyzeJoinFiles).toHaveBeenCalledTimes(2);
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("recommends join-output when every filename hints -output", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-output.csv", "/d/b-part1-of-2-output.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("join-output");
    expect(stage.selected).toBe("join-output");
  });

  it("recommends join-remaining when every filename hints -remaining", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-remaining.csv", "/d/b-remaining.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("join-remaining");
  });

  it("recommends split for a single unhinted file", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("split");
  });

  it("falls back to the unique valid op for mixed unhinted drops", async () => {
    mockApi({
      analyzeSplitFile: async () => ({ ok: false, error: "no" }),
      analyzeJoinFiles: async ({ kind, paths }) => (kind === "output" ? joinOk(paths) : joinBad),
    });
    await proposeTo(["/d/a.csv", "/d/b.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBe("join-output");
  });

  it("recommends nothing when several ops are valid and nothing is hinted", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a.csv", "/d/b.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.recommended).toBeNull();
    expect(stage.selected).toBeNull();
  });

  it("confirmOp applies the retained analysis without re-analyzing", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/plain.csv"]);
    usePrepareStore.getState().confirmOp();

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "split" });
    expect(state.split.file?.path).toBe("/d/plain.csv");
    expect(fns.analyzeSplitFile).toHaveBeenCalledTimes(1); // still just the proposal call
  });

  it("confirmOp populates the join slice for a join op", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-output.csv", "/d/b-output.csv"]);
    usePrepareStore.getState().confirmOp();

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "join-output" });
    expect(state.join.output.files.map((f) => f.path)).toEqual([
      "/d/a-output.csv",
      "/d/b-output.csv",
    ]);
    expect(state.join.output.totalRows).toBe(2);
  });

  it("selectOp switches the selection; confirmOp honors it", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    usePrepareStore.getState().selectOp("join-remaining");
    usePrepareStore.getState().confirmOp();
    expect(usePrepareStore.getState().stage).toMatchObject({
      kind: "configure",
      op: "join-remaining",
    });
  });

  it("changeOp returns to confirm with the same proposals", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    const before = usePrepareStore.getState().stage;
    if (before.kind !== "confirm") throw new Error("expected confirm");
    usePrepareStore.getState().confirmOp();
    usePrepareStore.getState().changeOp();
    const after = usePrepareStore.getState().stage;
    if (after.kind !== "confirm") throw new Error("expected confirm");
    expect(after.proposals).toBe(before.proposals); // same reference — retained, not rebuilt
  });

  it("dropPaths during confirm unions with the pending paths", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/a.csv"]);
    await proposeTo(["/d/b.csv", "/d/a.csv"]);
    const stage = usePrepareStore.getState().stage;
    if (stage.kind !== "confirm") throw new Error("expected confirm");
    expect(stage.paths).toEqual(["/d/a.csv", "/d/b.csv"]);
  });

  it("dropPaths during split-configure replaces the source", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/first.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().dropPaths(["/d/second.csv"]);

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "split" });
    expect(state.split.file?.path).toBe("/d/second.csv");
  });

  it("dropPaths during join-configure adds to the file set", async () => {
    const fns = permissiveAnalyzers();
    mockApi(fns);
    await proposeTo(["/d/a-output.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().dropPaths(["/d/b-output.csv"]);

    const state = usePrepareStore.getState();
    expect(state.stage).toMatchObject({ kind: "configure", op: "join-output" });
    expect(state.join.output.files.map((f) => f.path)).toEqual([
      "/d/a-output.csv",
      "/d/b-output.csv",
    ]);
  });

  it("removing the last join file returns to idle", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/a-output.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().removeJoinFile("output", "/d/a-output.csv");

    const state = usePrepareStore.getState();
    expect(state.stage).toEqual({ kind: "idle" });
    expect(state.join.output.files).toEqual([]);
  });

  it("browseFiles cancel keeps the idle stage and clears busy", async () => {
    mockApi({ pickPrepareFiles: async () => ({ canceled: true, paths: [] }) });
    await usePrepareStore.getState().browseFiles();
    expect(usePrepareStore.getState().stage).toEqual({ kind: "idle" });
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("browseFiles feeds picked paths into the proposal flow", async () => {
    mockApi({
      ...permissiveAnalyzers(),
      pickPrepareFiles: async () => ({ canceled: false, paths: ["/d/x.csv"] }),
    });
    await usePrepareStore.getState().browseFiles();
    expect(usePrepareStore.getState().stage.kind).toBe("confirm");
  });

  it("clamps split parts to the source row count and clears stale results", async () => {
    mockApi({
      ...permissiveAnalyzers(),
      runSplit: async () => ({ ok: true, files: [{ path: "/d/p1.csv", rowCount: 3 }] }),
    });
    await proposeTo(["/d/plain.csv"]); // fileInfo rowCount = 6
    usePrepareStore.getState().confirmOp();

    usePrepareStore.getState().setSplitParts(99);
    expect(usePrepareStore.getState().split.parts).toBe(6);
    usePrepareStore.getState().setSplitParts(0);
    expect(usePrepareStore.getState().split.parts).toBe(2);

    await usePrepareStore.getState().runSplit();
    expect(usePrepareStore.getState().split.result?.ok).toBe(true);
    usePrepareStore.getState().setSplitParts(3);
    expect(usePrepareStore.getState().split.result).toBeNull();
  });

  it("runJoin stores the result and ignores canceled saves", async () => {
    mockApi({
      ...permissiveAnalyzers(),
      runJoin: async () => ({ ok: false, canceled: true }),
    });
    await proposeTo(["/d/a-output.csv"]);
    usePrepareStore.getState().confirmOp();
    await usePrepareStore.getState().runJoin("output");
    expect(usePrepareStore.getState().join.output.result).toBeNull();
    expect(usePrepareStore.getState().busy).toBe(false);
  });

  it("reset returns to idle from any stage", async () => {
    mockApi(permissiveAnalyzers());
    await proposeTo(["/d/plain.csv"]);
    usePrepareStore.getState().confirmOp();
    usePrepareStore.getState().reset();
    expect(usePrepareStore.getState().stage).toEqual({ kind: "idle" });
    expect(usePrepareStore.getState().split.file).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project dom src/renderer/src/store/prepare-store.test.ts`
Expected: FAIL — `dropPaths` / `stage` etc. don't exist yet.

- [ ] **Step 3: Rewrite the store**

Replace the entire contents of `src/renderer/src/store/prepare-store.ts` with:

```ts
import { create } from "zustand";
import type {
  JoinAnalyzeResponse,
  JoinKind,
  JoinRunResponse,
  PrepareFileInfo,
  SplitAnalyzeResponse,
  SplitRunResponse,
  ValidationIssue,
} from "@core";

/**
 * Prepare-mode state, kept separate from the labeling store so the labeling
 * session (and its autosave subscription) is never disturbed.
 *
 * Drop-first stage machine: Idle (drop/browse) → Confirm (three analyzed
 * proposals, heuristic pre-selection, explicit user confirmation — always
 * shown, even for unambiguous drops) → Configure (per-op steps + run).
 */

export type PrepareOp = "split" | "join-output" | "join-remaining";

export interface OpProposal {
  op: PrepareOp;
  label: string;
  ok: boolean;
  fileCount: number;
  totalRows: number;
  errors: number;
  warnings: number;
  message?: string;
  /** Raw analyses retained so Confirm → Configure needs no re-analysis. */
  split?: SplitAnalyzeResponse;
  join?: JoinAnalyzeResponse;
}

export interface ConfirmData {
  paths: string[];
  proposals: OpProposal[];
  recommended: PrepareOp | null;
  selected: PrepareOp | null;
}

export type PrepareStage =
  | { kind: "idle" }
  | ({ kind: "confirm" } & ConfirmData)
  | { kind: "configure"; op: PrepareOp; from: ConfirmData };

interface JoinState {
  files: PrepareFileInfo[];
  crossFileIssues: ValidationIssue[];
  totalRows: number;
  result: JoinRunResponse | null;
}

interface SplitState {
  file: PrepareFileInfo | null;
  parts: number;
  result: SplitRunResponse | null;
}

interface PrepareState {
  stage: PrepareStage;
  busy: boolean;
  error: string | null;
  split: SplitState;
  join: Record<JoinKind, JoinState>;
}

interface PrepareActions {
  /** Open the mode-agnostic picker and feed the result into the proposal flow. */
  browseFiles: () => Promise<void>;
  /** Route dropped paths by stage: propose (idle/confirm), replace source (split), add files (join). */
  dropPaths: (paths: string[]) => Promise<void>;
  selectOp: (op: PrepareOp) => void;
  /** Enter Configure for the selected op using the retained analysis. */
  confirmOp: () => void;
  /** Back from Configure to the retained Confirm stage. */
  changeOp: () => void;
  setSplitParts: (parts: number) => void;
  runSplit: () => Promise<void>;
  pickJoinFiles: (kind: JoinKind) => Promise<void>;
  removeJoinFile: (kind: JoinKind, path: string) => Promise<void>;
  runJoin: (kind: JoinKind) => Promise<void>;
  reset: () => void;
}

export type PrepareStore = PrepareState & PrepareActions;

export function opLabel(op: PrepareOp): string {
  switch (op) {
    case "split":
      return "Split source";
    case "join-output":
      return "Join outputs";
    case "join-remaining":
      return "Join remaining";
  }
}

export function opKind(op: PrepareOp): JoinKind | null {
  return op === "join-output" ? "output" : op === "join-remaining" ? "remaining" : null;
}

const emptyJoin = (): JoinState => ({
  files: [],
  crossFileIssues: [],
  totalRows: 0,
  result: null,
});

const initialState = (): PrepareState => ({
  stage: { kind: "idle" },
  busy: false,
  error: null,
  split: { file: null, parts: 2, result: null },
  join: { output: emptyJoin(), remaining: emptyJoin() },
});

function clampParts(parts: number, rowCount: number): number {
  return Math.max(2, Math.min(Math.round(parts), Math.max(2, rowCount)));
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function stem(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? path;
  return name.replace(/\.[^.]*$/, "");
}

function joinKindFromName(path: string): JoinKind | null {
  const name = stem(path).toLowerCase();
  const match = name.match(/(?:-part\d+-of-\d+)?-(output|remaining)$/);
  if (!match) return null;
  return match[1] === "output" ? "output" : "remaining";
}

function countIssues(issues: readonly ValidationIssue[]): { errors: number; warnings: number } {
  const errors = issues.filter((i) => i.severity === "error").length;
  return { errors, warnings: issues.length - errors };
}

function splitProposal(paths: readonly string[], response: SplitAnalyzeResponse): OpProposal {
  const issues = countIssues(response.file?.issues ?? []);
  return {
    op: "split",
    label: opLabel("split"),
    ok: Boolean(response.file?.ok),
    fileCount: response.file ? 1 : 0,
    totalRows: response.file?.rowCount ?? 0,
    errors: issues.errors,
    warnings: issues.warnings,
    message:
      response.error ??
      (paths.length > 1
        ? `Uses ${paths[0]?.split(/[/\\]/).pop() ?? "the first file"}; ignores ${String(
            paths.length - 1,
          )} other file${paths.length === 2 ? "" : "s"}.`
        : undefined),
    split: response,
  };
}

function joinProposal(op: PrepareOp, response: JoinAnalyzeResponse): OpProposal {
  const fileIssues = (response.files ?? []).flatMap((file) => file.issues);
  const crossIssues = response.crossFileIssues ?? [];
  const issues = countIssues([...fileIssues, ...crossIssues]);
  return {
    op,
    label: opLabel(op),
    ok: response.ok,
    fileCount: response.files?.length ?? 0,
    totalRows: response.totalRows ?? 0,
    errors: issues.errors,
    warnings: issues.warnings,
    message: response.error,
    join: response,
  };
}

/**
 * Deterministic recommendation: unanimous filename hints win, then a lone
 * unhinted file suggests a split, then a uniquely valid analysis; otherwise
 * no pre-selection (the user must pick before Continue enables).
 */
function recommendOp(
  paths: readonly string[],
  proposals: readonly OpProposal[],
): PrepareOp | null {
  const hints = paths.map(joinKindFromName);
  const first = hints[0];
  if (first && hints.every((h) => h === first)) {
    return first === "output" ? "join-output" : "join-remaining";
  }
  if (paths.length === 1 && hints.every((h) => h === null)) return "split";
  const valid = proposals.filter((p) => p.ok);
  return valid.length === 1 ? valid[0]!.op : null;
}

export const usePrepareStore = create<PrepareStore>((set, get) => {
  async function buildProposals(paths: string[]): Promise<OpProposal[]> {
    const [split, output, remaining] = await Promise.all([
      window.api.analyzeSplitFile(paths[0]!),
      window.api.analyzeJoinFiles({ kind: "output", paths }),
      window.api.analyzeJoinFiles({ kind: "remaining", paths }),
    ]);
    return [
      splitProposal(paths, split),
      joinProposal("join-output", output),
      joinProposal("join-remaining", remaining),
    ];
  }

  async function propose(paths: string[]): Promise<void> {
    set({ busy: true, error: null });
    const proposals = await buildProposals(paths);
    const recommended = recommendOp(paths, proposals);
    set({
      busy: false,
      stage: { kind: "confirm", paths, proposals, recommended, selected: recommended },
    });
  }

  async function analyzeJoinPaths(kind: JoinKind, paths: string[]): Promise<void> {
    const response = await window.api.analyzeJoinFiles({ kind, paths });
    if (response.canceled) {
      set({ busy: false });
      return;
    }
    set({
      busy: false,
      error: response.error ?? null,
      join: {
        ...get().join,
        [kind]: {
          files: response.files ?? [],
          crossFileIssues: response.crossFileIssues ?? [],
          totalRows: response.totalRows ?? 0,
          result: null,
        },
      },
    });
  }

  async function replaceSplitSource(path: string): Promise<void> {
    set({ busy: true });
    const response = await window.api.analyzeSplitFile(path);
    if (response.canceled) {
      set({ busy: false });
      return;
    }
    set({
      busy: false,
      error: response.error ?? null,
      split: {
        file: response.file ?? null,
        parts: clampParts(get().split.parts, response.file?.rowCount ?? 2),
        result: null,
      },
    });
  }

  return {
    ...initialState(),

    async browseFiles() {
      set({ busy: true, error: null });
      const picked = await window.api.pickPrepareFiles();
      if (picked.canceled || picked.paths.length === 0) {
        set({ busy: false });
        return;
      }
      await propose(unique(picked.paths));
    },

    async dropPaths(paths) {
      const clean = unique(paths);
      if (clean.length === 0) return;
      const { stage } = get();

      if (stage.kind === "configure") {
        const kind = opKind(stage.op);
        if (!kind) {
          await replaceSplitSource(clean[0]!);
          return;
        }
        set({ busy: true, error: null });
        const existing = get().join[kind].files.map((f) => f.path);
        await analyzeJoinPaths(kind, unique([...existing, ...clean]));
        return;
      }

      const base = stage.kind === "confirm" ? stage.paths : [];
      await propose(unique([...base, ...clean]));
    },

    selectOp(op) {
      const { stage } = get();
      if (stage.kind !== "confirm") return;
      set({ stage: { ...stage, selected: op } });
    },

    confirmOp() {
      const { stage } = get();
      if (stage.kind !== "confirm" || !stage.selected) return;
      const proposal = stage.proposals.find((p) => p.op === stage.selected);
      if (!proposal) return;
      const from: ConfirmData = {
        paths: stage.paths,
        proposals: stage.proposals,
        recommended: stage.recommended,
        selected: stage.selected,
      };

      if (proposal.op === "split") {
        const file = proposal.split?.file ?? null;
        set({
          stage: { kind: "configure", op: "split", from },
          error: proposal.split?.error ?? null,
          split: {
            file,
            parts: clampParts(get().split.parts, file?.rowCount ?? 2),
            result: null,
          },
        });
        return;
      }

      const kind = opKind(proposal.op);
      if (!kind) return;
      set({
        stage: { kind: "configure", op: proposal.op, from },
        error: proposal.join?.error ?? null,
        join: {
          ...get().join,
          [kind]: {
            files: proposal.join?.files ?? [],
            crossFileIssues: proposal.join?.crossFileIssues ?? [],
            totalRows: proposal.join?.totalRows ?? 0,
            result: null,
          },
        },
      });
    },

    changeOp() {
      const { stage } = get();
      if (stage.kind !== "configure") return;
      set({ error: null, stage: { kind: "confirm", ...stage.from } });
    },

    setSplitParts(parts) {
      const { split } = get();
      set({
        split: {
          ...split,
          parts: clampParts(parts, split.file?.rowCount ?? 2),
          result: null,
        },
      });
    },

    async runSplit() {
      const { split } = get();
      if (!split.file) return;
      set({ busy: true });
      const result = await window.api.runSplit({ path: split.file.path, parts: split.parts });
      set({ busy: false, split: { ...get().split, result } });
    },

    async pickJoinFiles(kind) {
      set({ busy: true });
      const existing = get().join[kind].files.map((f) => f.path);
      const response = await window.api.pickJoinFiles(kind);
      if (response.canceled) {
        set({ busy: false });
        return;
      }
      const picked = (response.files ?? []).map((f) => f.path);
      const merged = unique([...existing, ...picked]);
      // A pick into an empty list is already the full analysis; otherwise the
      // union of old + new files must be re-analyzed as one set.
      if (existing.length === 0) {
        set({
          busy: false,
          error: response.error ?? null,
          join: {
            ...get().join,
            [kind]: {
              files: response.files ?? [],
              crossFileIssues: response.crossFileIssues ?? [],
              totalRows: response.totalRows ?? 0,
              result: null,
            },
          },
        });
        return;
      }
      await analyzeJoinPaths(kind, merged);
    },

    async removeJoinFile(kind, path) {
      const rest = get()
        .join[kind].files.map((f) => f.path)
        .filter((p) => p !== path);
      if (rest.length === 0) {
        set({
          busy: false,
          error: null,
          stage: { kind: "idle" },
          join: { ...get().join, [kind]: emptyJoin() },
        });
        return;
      }
      set({ busy: true });
      await analyzeJoinPaths(kind, rest);
    },

    async runJoin(kind) {
      const paths = get().join[kind].files.map((f) => f.path);
      if (paths.length === 0) return;
      set({ busy: true });
      const result = await window.api.runJoin({ kind, paths });
      set({ busy: false });
      if (result.canceled) return;
      set({ join: { ...get().join, [kind]: { ...get().join[kind], result } } });
    },

    reset() {
      set(initialState());
    },
  };
});
```

- [ ] **Step 4: Run to verify the store tests pass**

Run: `pnpm vitest run --project dom src/renderer/src/store/prepare-store.test.ts`
Expected: PASS (20 tests). (Whole-project typecheck is now red in old Prepare components — expected until Task 9.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/prepare-store.ts src/renderer/src/store/prepare-store.test.ts
git commit -m "store: rewrite prepare-store as drop-first stage machine"
```

---

### Task 6: ChunkMap component (test-first)

Discrete partition blocks with real output filenames from `partFileNames`.

**Files:**
- Create: `src/renderer/src/prepare/ChunkMap.tsx`
- Create: `src/renderer/src/prepare/ChunkMap.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/prepare/ChunkMap.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ChunkMap } from "./ChunkMap";

describe("ChunkMap", () => {
  afterEach(() => cleanup());

  it("renders one block per part with row counts and full output names", () => {
    render(<ChunkMap sourcePath="/d/survey.csv" sizes={[3, 3, 2]} />);
    expect(screen.getByText("Part 1")).toBeInTheDocument();
    expect(screen.getByText("Part 3")).toBeInTheDocument();
    expect(screen.getByText("survey-part1-of-3.csv")).toBeInTheDocument();
    expect(screen.getByText("survey-part3-of-3.csv")).toBeInTheDocument();
    expect(screen.getAllByText("3 rows")).toHaveLength(2);
    expect(screen.getByText("2 rows")).toBeInTheDocument();
  });

  it("sizes blocks proportionally to their row counts", () => {
    render(<ChunkMap sourcePath="/d/survey.csv" sizes={[6, 2]} />);
    const list = screen.getByRole("list", { name: /2 part files/i });
    const blocks = [...list.children] as HTMLElement[];
    expect(blocks[0]!.style.flexGrow).toBe("6");
    expect(blocks[1]!.style.flexGrow).toBe("2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run --project dom src/renderer/src/prepare/ChunkMap.test.tsx`
Expected: FAIL — cannot resolve `./ChunkMap`.

- [ ] **Step 3: Implement**

Create `src/renderer/src/prepare/ChunkMap.tsx`:

```tsx
import { partFileNames } from "@core";
import { cn } from "../lib/utils";

/**
 * Visualizes a split as discrete blocks: one per part file, width proportional
 * to its row count, labeled with the exact filename the split will write
 * (names come from core so preview and writer can never disagree).
 */
export function ChunkMap({
  sourcePath,
  sizes,
}: {
  sourcePath: string;
  sizes: readonly number[];
}): React.JSX.Element {
  const names = partFileNames(sourcePath, sizes.length);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return (
    <ul
      aria-label={`${String(sizes.length)} part files`}
      className="mt-3 flex list-none gap-1.5 p-0"
    >
      {sizes.map((size, index) => (
        <li
          key={index}
          style={{ flexGrow: size, flexBasis: `${String((size / total) * 100)}%` }}
          className={cn(
            "min-w-0 rounded-md border border-accent/40 px-1.5 py-1.5 text-center",
            index % 2 === 0 ? "bg-accent/20" : "bg-accent/10",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            Part {index + 1}
          </p>
          <p className="text-xs font-semibold tabular-nums">
            {size} row{size === 1 ? "" : "s"}
          </p>
          <p className="break-all text-[10px] leading-tight text-muted-foreground">
            {names[index]}
          </p>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run --project dom src/renderer/src/prepare/ChunkMap.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/prepare/ChunkMap.tsx src/renderer/src/prepare/ChunkMap.test.tsx
git commit -m "prepare: add ChunkMap partition visualization"
```

---

### Task 7: IdleStage + ConfirmStage components

Rendering-level tests for these land in the rewritten `PrepareView.test.tsx` (Task 9), where store + view integrate; this task only needs the components to compile.

**Files:**
- Create: `src/renderer/src/prepare/IdleStage.tsx`
- Create: `src/renderer/src/prepare/ConfirmStage.tsx`

- [ ] **Step 1: Create IdleStage**

Create `src/renderer/src/prepare/IdleStage.tsx`:

```tsx
import { Upload } from "lucide-react";
import { usePrepareStore } from "../store/prepare-store";

/** Idle stage: one large drop-or-browse affordance; the card handles drops. */
export function IdleStage(): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const browseFiles = usePrepareStore((s) => s.browseFiles);

  return (
    <div className="p-4">
      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void browseFiles()}
        className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border bg-accent/[0.03] px-5 py-12 text-center transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Upload size={22} aria-hidden="true" className="mb-1 text-accent" />
        <span className="text-base font-semibold">Drop files here</span>
        <span className="max-w-md text-sm text-muted-foreground">
          MLabel reads them and proposes the right operation — splitting a source, joining
          labeled outputs, or joining unfinished remainders.
        </span>
        <span className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium">
          Browse files…
        </span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create ConfirmStage**

Create `src/renderer/src/prepare/ConfirmStage.tsx`:

```tsx
import { ArrowRight, Loader2, X } from "lucide-react";
import type { PrepareStage } from "../store/prepare-store";
import { opLabel, usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { baseName, cn } from "../lib/utils";

/** Confirm stage: heuristic proposals as a radiogroup, user approves one. */
export function ConfirmStage({
  stage,
}: {
  stage: Extract<PrepareStage, { kind: "confirm" }>;
}): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const selectOp = usePrepareStore((s) => s.selectOp);
  const confirmOp = usePrepareStore((s) => s.confirmOp);
  const reset = usePrepareStore((s) => s.reset);
  const headingRef = useHeadingFocus();
  const count = stage.paths.length;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
            {count} file{count === 1 ? "" : "s"} ready — confirm the operation
          </h2>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {stage.paths.map(baseName).join(", ")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Start over"
          onClick={reset}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X size={13} aria-hidden="true" />
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
          {error}
        </div>
      )}

      <div role="radiogroup" aria-label="Operation" className="grid gap-2 pt-1 md:grid-cols-3">
        {stage.proposals.map((proposal) => {
          const selected = stage.selected === proposal.op;
          return (
            <button
              key={proposal.op}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy}
              onClick={() => selectOp(proposal.op)}
              className={cn(
                "relative rounded-lg border border-border bg-background/35 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                selected && "border-accent bg-accent/10 ring-1 ring-accent",
              )}
            >
              {stage.recommended === proposal.op && (
                <span className="absolute -top-2 left-2 rounded-md border border-accent/40 bg-accent/15 px-1.5 text-[10px] font-semibold uppercase text-accent">
                  Recommended
                </span>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{proposal.label}</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px]",
                    proposal.ok
                      ? "bg-progress/10 text-progress-text"
                      : proposal.errors > 0
                        ? "bg-danger/10 text-danger-text"
                        : "bg-warning/10 text-warning-text",
                  )}
                >
                  {proposal.ok
                    ? "Valid"
                    : proposal.errors > 0
                      ? `${String(proposal.errors)} error${proposal.errors === 1 ? "" : "s"}`
                      : `${String(proposal.warnings)} warning${proposal.warnings === 1 ? "" : "s"}`}
                </span>
              </div>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                {proposal.fileCount} file{proposal.fileCount === 1 ? "" : "s"} ·{" "}
                {proposal.totalRows} row{proposal.totalRows === 1 ? "" : "s"}
              </p>
              {proposal.message && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {proposal.message}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button disabled={busy || !stage.selected} onClick={confirmOp}>
          {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
          Continue{stage.selected ? ` with ${opLabel(stage.selected)}` : ""}
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both compile**

Run: `pnpm vitest run --project dom src/renderer/src/prepare/ChunkMap.test.tsx`
Expected: PASS (vitest transpiles the new files' imports without type errors surfacing here; full verification happens in Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/prepare/IdleStage.tsx src/renderer/src/prepare/ConfirmStage.tsx
git commit -m "prepare: add IdleStage and ConfirmStage components"
```

---

### Task 8: Configure stages (Split + Join) and shared header

**Files:**
- Create: `src/renderer/src/prepare/ConfigureHeader.tsx`
- Rewrite: `src/renderer/src/prepare/SplitPanel.tsx` → delete after creating `SplitConfigure.tsx`
- Create: `src/renderer/src/prepare/SplitConfigure.tsx`
- Create: `src/renderer/src/prepare/JoinConfigure.tsx`
- Delete: `src/renderer/src/prepare/SplitPanel.tsx`, `src/renderer/src/prepare/JoinPanel.tsx`, `src/renderer/src/prepare/PrepareOperationPanel.tsx`

- [ ] **Step 1: Create the shared configure header**

Create `src/renderer/src/prepare/ConfigureHeader.tsx`:

```tsx
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { PrepareOp } from "../store/prepare-store";
import { opLabel, usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

/** Configure-stage chrome: operation chip, change-operation, start-over. */
export function ConfigureHeader({ op }: { op: PrepareOp }): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const changeOp = usePrepareStore((s) => s.changeOp);
  const reset = usePrepareStore((s) => s.reset);
  const headingRef = useHeadingFocus();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 text-sm font-semibold text-accent outline-none"
        >
          {opLabel(op)}
        </h2>
        <Button variant="outline" size="xs" disabled={busy} onClick={changeOp}>
          Change operation
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Start over"
        disabled={busy}
        onClick={reset}
        className="text-muted-foreground hover:text-foreground"
      >
        <X size={13} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Small uppercase section label used inside configure stages. */
export function Eyebrow({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="text-[11px] font-semibold uppercase text-muted-foreground">{children}</p>;
}
```

- [ ] **Step 2: Create SplitConfigure**

Create `src/renderer/src/prepare/SplitConfigure.tsx`:

```tsx
import { Loader2, Minus, Plus, Scissors } from "lucide-react";
import { chunkSizes } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { FileStatusRow } from "./FileStatusRow";
import { ChunkMap } from "./ChunkMap";
import { ConfigureHeader, Eyebrow } from "./ConfigureHeader";
import { PrepareResultList } from "./PrepareResultList";

export function SplitConfigure(): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const split = usePrepareStore((s) => s.split);
  const setSplitParts = usePrepareStore((s) => s.setSplitParts);
  const runSplit = usePrepareStore((s) => s.runSplit);

  const { file, parts, result } = split;
  const canSplit =
    Boolean(file?.ok) && (file?.rowCount ?? 0) >= 2 && parts <= (file?.rowCount ?? 0);
  const sizes = file && canSplit ? chunkSizes(file.rowCount, parts) : undefined;

  return (
    <div>
      <ConfigureHeader op="split" />
      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {error}
          </div>
        )}

        {file && (
          <>
            <div className="space-y-2">
              <Eyebrow>Source</Eyebrow>
              <FileStatusRow file={file} />
            </div>

            <div className="space-y-2">
              <Eyebrow>Partition</Eyebrow>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {file.rowCount} row{file.rowCount === 1 ? "" : "s"} → {parts} contiguous part
                    file{parts === 1 ? "" : "s"}, written next to the source.
                  </p>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Fewer files"
                      disabled={busy || parts <= 2}
                      onClick={() => setSplitParts(parts - 1)}
                    >
                      <Minus size={13} />
                    </Button>
                    <input
                      type="number"
                      min={2}
                      max={file.rowCount}
                      value={parts}
                      aria-label="Number of split files"
                      disabled={busy}
                      onChange={(event) => setSplitParts(Number(event.currentTarget.value))}
                      className="h-8 w-16 rounded-md border border-border bg-background/50 px-2 text-center text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="More files"
                      disabled={busy || parts >= file.rowCount}
                      onClick={() => setSplitParts(parts + 1)}
                    >
                      <Plus size={13} />
                    </Button>
                  </div>
                </div>
                {sizes && <ChunkMap sourcePath={file.path} sizes={sizes} />}
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={busy || !canSplit} onClick={() => void runSplit()}>
                {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
                <Scissors size={14} aria-hidden="true" /> Split into {parts} files
              </Button>
            </div>

            {result && !result.ok && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
                {result.error}
              </div>
            )}
            {result?.ok && result.files && (
              <PrepareResultList
                title="Split complete"
                files={result.files}
                summary={`${String(result.files.length)} file${
                  result.files.length === 1 ? "" : "s"
                }`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create JoinConfigure**

Create `src/renderer/src/prepare/JoinConfigure.tsx`:

```tsx
import { Combine, Loader2, Plus } from "lucide-react";
import type { JoinKind } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { IssueList } from "../components/IssueList";
import { FileStatusRow } from "./FileStatusRow";
import { ConfigureHeader, Eyebrow } from "./ConfigureHeader";
import { PrepareResultList } from "./PrepareResultList";

export function JoinConfigure({ kind }: { kind: JoinKind }): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const join = usePrepareStore((s) => s.join[kind]);
  const pickJoinFiles = usePrepareStore((s) => s.pickJoinFiles);
  const removeJoinFile = usePrepareStore((s) => s.removeJoinFile);
  const runJoin = usePrepareStore((s) => s.runJoin);

  const { files, crossFileIssues, totalRows, result } = join;
  const duplicateCount = crossFileIssues.filter((i) => i.kind === "duplicate").length;
  const blocked =
    files.length === 0 ||
    files.some((f) => !f.ok) ||
    crossFileIssues.some((i) => i.severity === "error");

  return (
    <div>
      <ConfigureHeader op={kind === "output" ? "join-output" : "join-remaining"} />
      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Files</Eyebrow>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void pickJoinFiles(kind)}
            >
              <Plus size={14} aria-hidden="true" /> Add files…
            </Button>
          </div>
          <div className="space-y-2">
            {files.map((file) => (
              <FileStatusRow
                key={file.path}
                file={file}
                onRemove={() => void removeJoinFile(kind, file.path)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Eyebrow>Validation</Eyebrow>
          {crossFileIssues.length > 0 && <IssueList issues={crossFileIssues} />}
          <div className="grid gap-2 sm:grid-cols-3">
            <StatPill
              label="Files"
              value={`${String(files.length)} file${files.length === 1 ? "" : "s"}`}
            />
            <StatPill
              label="Rows"
              value={`${String(totalRows)} row${totalRows === 1 ? "" : "s"}`}
            />
            <StatPill
              label="Duplicates"
              value={`${String(duplicateCount)} row${duplicateCount === 1 ? "" : "s"}`}
              tone={duplicateCount > 0 ? "warning" : "default"}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={busy || blocked} onClick={() => void runJoin(kind)}>
            {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
            <Combine size={14} aria-hidden="true" /> Join {files.length} file
            {files.length === 1 ? "" : "s"}…
          </Button>
        </div>

        {result && !result.ok && !result.canceled && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {result.error}
          </div>
        )}
        {result?.ok && result.path && (
          <PrepareResultList
            title="Join complete"
            files={[{ path: result.path, rowCount: result.rowCount }]}
            summary={`${String(result.rowCount ?? 0)} row${result.rowCount === 1 ? "" : "s"}${
              (result.duplicateCount ?? 0) > 0
                ? ` · ${String(result.duplicateCount)} duplicate${
                    result.duplicateCount === 1 ? "" : "s"
                  }`
                : ""
            }`}
          />
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}): React.JSX.Element {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
          : "rounded-lg border border-border bg-muted/30 px-3 py-2"
      }
    >
      <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
      <p className={tone === "warning" ? "mt-0.5 text-sm text-warning-text" : "mt-0.5 text-sm"}>
        {value}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Delete the superseded panels**

```bash
git rm src/renderer/src/prepare/SplitPanel.tsx src/renderer/src/prepare/JoinPanel.tsx src/renderer/src/prepare/PrepareOperationPanel.tsx
```

(All three are tracked after Task 1's baseline commit, so plain `git rm` works.)

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer/src/prepare/
git commit -m "prepare: add configure stages; retire SplitPanel/JoinPanel"
```

---

### Task 9: PrepareView shell rewrite, deletions, and view tests

This task makes the whole repo typecheck again.

**Files:**
- Rewrite: `src/renderer/src/prepare/PrepareView.tsx`
- Rewrite: `src/renderer/src/prepare/PrepareView.test.tsx`
- Delete: `src/renderer/src/prepare/PrepareTaskMap.tsx`, `src/renderer/src/prepare/PrepareDropSurface.tsx`
- Modify: `src/renderer/src/app.test.tsx` (one assertion)

- [ ] **Step 1: Rewrite PrepareView**

Replace the entire contents of `src/renderer/src/prepare/PrepareView.tsx` with:

```tsx
import type { AppConfig } from "@core";
import { useStore } from "../store/store";
import { usePrepareStore } from "../store/prepare-store";
import { IdleStage } from "./IdleStage";
import { ConfirmStage } from "./ConfirmStage";
import { SplitConfigure } from "./SplitConfigure";
import { JoinConfigure } from "./JoinConfigure";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

/**
 * Prepare mode, drop-first: files land anywhere on the card, MLabel proposes
 * the operation (Confirm stage), the user approves, then configures and runs.
 */
export function PrepareView(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const stage = usePrepareStore((s) => s.stage);
  const dropPaths = usePrepareStore((s) => s.dropPaths);
  const headingRef = useHeadingFocus();

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const paths = [...event.dataTransfer.files].map((file) => window.api.pathForFile(file));
    void dropPaths(paths);
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 pb-8 pt-2 sm:px-6">
        <header className="min-w-0">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight outline-none"
          >
            Prepare data
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Split a source file into parts for your labelers, or merge their finished work back
            together.
          </p>
        </header>

        <section
          aria-label="Prepare workspace"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="glass-card overflow-hidden rounded-xl border border-border shadow-sm"
        >
          {stage.kind === "idle" && <IdleStage />}
          {stage.kind === "confirm" && <ConfirmStage stage={stage} />}
          {stage.kind === "configure" && stage.op === "split" && <SplitConfigure />}
          {stage.kind === "configure" && stage.op === "join-output" && (
            <JoinConfigure kind="output" />
          )}
          {stage.kind === "configure" && stage.op === "join-remaining" && (
            <JoinConfigure kind="remaining" />
          )}
          <ContractFooter config={config} />
        </section>
      </div>
    </div>
  );
}

function ContractFooter({ config }: { config: AppConfig | null }): React.JSX.Element {
  const inputFields = config?.input.fields ?? [];
  const outputFields = config?.output.fields ?? [];
  return (
    <details className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2">
        <span>
          Data contract · {inputFields.length} input field{inputFields.length === 1 ? "" : "s"} →{" "}
          {outputFields.length} output field{outputFields.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-md border border-border px-1.5 py-0.5">Details</span>
      </summary>
      <div className="mt-2 grid gap-2 pb-1 md:grid-cols-2">
        <div className="min-w-0 rounded-md bg-background/35 p-2">
          <p className="font-medium text-foreground">Input schema</p>
          <p className="mt-1 max-h-20 overflow-auto break-words">
            {inputFields.map((f) => f.name).join(", ") || "None"}
          </p>
        </div>
        <div className="min-w-0 rounded-md bg-background/35 p-2">
          <p className="font-medium text-foreground">Output schema</p>
          <p className="mt-1 max-h-20 overflow-auto break-words">
            {outputFields.map((f) => f.name).join(", ") || "None"}
          </p>
        </div>
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Delete the dead components**

```bash
git rm src/renderer/src/prepare/PrepareTaskMap.tsx src/renderer/src/prepare/PrepareDropSurface.tsx
```

- [ ] **Step 3: Rewrite the view tests**

Replace the entire contents of `src/renderer/src/prepare/PrepareView.test.tsx` with:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadConfig } from "@core/config";
import type { AppConfig, IpcApi, JoinAnalyzeResponse, PrepareFileInfo } from "@core";
import { useStore } from "../store/store";
import { usePrepareStore } from "../store/prepare-store";
import { PrepareView } from "./PrepareView";

function sampleConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": { "fields": [{ "name": "label", "control": "text" }] }
  }`);
  if (!result.ok) throw new Error("invalid sample config");
  return result.config;
}

function fileInfo(path: string, rowCount = 4, ok = true): PrepareFileInfo {
  return { path, rowCount, ok, issues: [] };
}

function joinOk(paths: readonly string[]): JoinAnalyzeResponse {
  return {
    ok: true,
    files: paths.map((path) => fileInfo(path)),
    crossFileIssues: [],
    totalRows: paths.length,
  };
}

function mockApi(overrides: Partial<IpcApi> = {}): IpcApi {
  const base: IpcApi = {
    ping: async () => "pong",
    getTheme: async () => false,
    onThemeChange: () => () => {},
    onUpdateStatus: () => () => {},
    onSetMode: () => () => {},
    setMenuContext: async () => {},
    installUpdate: async () => {},
    checkForUpdates: async () => {},
    openExternal: async () => {},
    revealPath: async () => {},
    getStartupConfig: async () => ({ status: "none" }),
    pickConfig: async () => ({ status: "canceled" }),
    pickInput: async () => ({ ok: false, canceled: true }),
    loadInput: async () => ({ ok: false, canceled: true }),
    pathForFile: (file) => `/d/${file.name}`,
    saveSession: async () => {},
    clearSession: async () => {},
    exportLabels: async () => ({ ok: true }),
    getRecent: async () => ({}),
    pickSplitFile: async () => ({ ok: false, canceled: true }),
    analyzeSplitFile: async (path) => ({ ok: true, file: fileInfo(path, 5) }),
    pickPrepareFiles: async () => ({ canceled: true, paths: [] }),
    runSplit: async () => ({ ok: false }),
    pickJoinFiles: async () => ({ ok: false, canceled: true }),
    analyzeJoinFiles: async ({ paths }) => joinOk(paths),
    runJoin: async () => ({ ok: false }),
  };
  const api: IpcApi = { ...base, ...overrides };
  Object.defineProperty(window, "api", { value: api, configurable: true });
  return api;
}

function dropFiles(names: string[]): void {
  const files = names.map((name) => new File([""], name));
  const card = screen.getByRole("region", { name: "Prepare workspace" });
  fireEvent.drop(card, { dataTransfer: { files } });
}

describe("PrepareView", () => {
  beforeEach(() => {
    usePrepareStore.getState().reset();
    useStore.setState({ config: sampleConfig(), phase: "prepare" });
    mockApi();
  });
  afterEach(() => cleanup());

  it("starts idle: drop copy, browse affordance, contract footer, no tiles", () => {
    render(<PrepareView />);
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
    expect(screen.getByText(/proposes the right operation/)).toBeInTheDocument();
    expect(screen.getByText("Browse files…")).toBeInTheDocument();
    expect(screen.getByText(/Data contract · 1 input field → 1 output field/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("browse feeds the proposal flow", async () => {
    const user = userEvent.setup();
    mockApi({ pickPrepareFiles: async () => ({ canceled: false, paths: ["/d/plain.csv"] }) });
    render(<PrepareView />);
    await user.click(screen.getByText("Browse files…"));
    await waitFor(() =>
      expect(screen.getByText(/1 file ready — confirm the operation/)).toBeInTheDocument(),
    );
  });

  it("drop shows the confirm stage with the hinted op recommended and preselected", async () => {
    render(<PrepareView />);
    dropFiles(["a-output.csv", "b-output.csv"]);

    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Join outputs/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("a-output.csv, b-output.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue with Join outputs/ })).toBeEnabled();
  });

  it("ambiguous drops preselect nothing and disable Continue until a pick", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    dropFiles(["a.csv", "b.csv"]);

    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: /^Continue/ });
    expect(continueButton).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Join remaining/ }));
    expect(screen.getByRole("button", { name: /Continue with Join remaining/ })).toBeEnabled();
  });

  it("walks split end-to-end: drop → confirm → chunk map with real names → run → results", async () => {
    const user = userEvent.setup();
    const revealPath = vi.fn(async () => {});
    mockApi({
      revealPath,
      runSplit: async () => ({
        ok: true,
        files: [
          { path: "/d/input-part1-of-2.csv", rowCount: 3 },
          { path: "/d/input-part2-of-2.csv", rowCount: 2 },
        ],
      }),
    });
    render(<PrepareView />);
    dropFiles(["input.csv"]);

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Split source/ })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    await user.click(screen.getByRole("button", { name: /Continue with Split source/ }));

    await waitFor(() => expect(screen.getByText("input.csv")).toBeInTheDocument());
    expect(screen.getByText("input-part1-of-2.csv")).toBeInTheDocument();
    expect(screen.getByText("input-part2-of-2.csv")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /split into 2 files/i }));
    await waitFor(() => expect(screen.getByText("Split complete")).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: /show in/i })[0]!);
    expect(revealPath).toHaveBeenCalledWith("/d/input-part1-of-2.csv");
  });

  it("change operation returns to the confirm stage", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    dropFiles(["input.csv"]);
    await waitFor(() => screen.getByRole("button", { name: /Continue with Split source/ }));
    await user.click(screen.getByRole("button", { name: /Continue with Split source/ }));
    await waitFor(() => screen.getByRole("button", { name: /change operation/i }));

    await user.click(screen.getByRole("button", { name: /change operation/i }));
    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());
  });

  it("start over returns to idle", async () => {
    const user = userEvent.setup();
    render(<PrepareView />);
    dropFiles(["input.csv"]);
    await waitFor(() => screen.getByRole("button", { name: "Start over" }));
    await user.click(screen.getByRole("button", { name: "Start over" }));
    expect(screen.getByText("Drop files here")).toBeInTheDocument();
  });

  it("blocks joins containing files with errors", async () => {
    const bad: PrepareFileInfo = {
      path: "/d/bad-output.csv",
      rowCount: 2,
      ok: false,
      issues: [{ kind: "missing", severity: "error", field: "label", message: "Missing column." }],
    };
    mockApi({
      analyzeJoinFiles: async ({ kind, paths }) =>
        kind === "output"
          ? { ok: false, files: [bad], crossFileIssues: [], totalRows: 2 }
          : joinOk(paths),
    });
    render(<PrepareView />);
    dropFiles(["bad-output.csv"]);

    await waitFor(() => screen.getByRole("radiogroup"));
    // Hinted recommendation still preselects join-output despite errors.
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Continue with Join outputs/ }));

    await waitFor(() => expect(screen.getByText(/Missing column/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /join 1 file/i })).toBeDisabled();
  });
});
```

- [ ] **Step 4: Update the app-level copy assertion**

In `src/renderer/src/app.test.tsx`, find the assertion added by the baseline iteration:

```tsx
    expect(screen.getByText(/Drop files to auto-detect/)).toBeInTheDocument();
```

and replace it with:

```tsx
    expect(screen.getByText(/proposes the right operation/)).toBeInTheDocument();
```

(The adjacent `getByText("Drop files here")` assertion remains valid.)

- [ ] **Step 5: Run the dom suite and typecheck**

Run: `pnpm vitest run --project dom && pnpm typecheck`
Expected: all dom tests PASS (including app.test.tsx); typecheck PASS — the repo is whole again.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/src/prepare/ src/renderer/src/app.test.tsx
git commit -m "prepare: drop-first PrepareView shell; delete task map and drop surface"
```

---

### Task 10: Full verification and artifact cleanup

**Files:**
- Delete: `docs/superpowers/` (spec + this plan), `.superpowers/` (mockups)

- [ ] **Step 1: Run the full gate**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all PASS. Fix anything that fails before proceeding (formatting drift → `pnpm format`).

- [ ] **Step 2: Manual smoke check (dev app)**

Run `pnpm dev`, switch to Prepare via the app menu, and verify: idle drop zone renders; dropping a CSV shows the confirm tiles with a Recommended tag; Continue lands in configure; the chunk map shows `<name>-partN-of-M.csv` labels; Change operation and ✕ behave. Quit when satisfied.

- [ ] **Step 3: Remove design/mockup artifacts (project convention)**

```bash
git rm -r docs/superpowers
rm -rf .superpowers
git commit -m "Remove superpowers design artifacts for Prepare redesign"
```

- [ ] **Step 4: Final review**

Run `git log --oneline main -12` and confirm the commit sequence tells the story: baseline → core naming → main naming → IPC → store → ChunkMap → stages → configure → view → cleanup.
