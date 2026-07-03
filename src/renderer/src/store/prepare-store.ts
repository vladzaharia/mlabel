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
 */

export type PrepareTab = "split" | "join-output" | "join-remaining";
export type PrepareAction = PrepareTab | null;

export interface DropResolutionSummary {
  tab: PrepareTab;
  label: string;
  ok: boolean;
  fileCount: number;
  totalRows: number;
  errors: number;
  warnings: number;
  message?: string;
}

export interface PendingDropResolution {
  paths: string[];
  summaries: DropResolutionSummary[];
}

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
  selectedAction: PrepareAction;
  tab: PrepareTab;
  busy: boolean;
  error: string | null;
  pendingDrop: PendingDropResolution | null;
  split: SplitState;
  join: Record<JoinKind, JoinState>;
}

interface PrepareActions {
  setTab: (tab: PrepareTab) => void;
  pickSplitFile: () => Promise<void>;
  analyzeSplitPath: (path: string) => Promise<void>;
  clearSplitFile: () => void;
  setSplitParts: (parts: number) => void;
  runSplit: () => Promise<void>;
  pickJoinFiles: (kind: JoinKind) => Promise<void>;
  removeJoinFile: (kind: JoinKind, path: string) => Promise<void>;
  runJoin: (kind: JoinKind) => Promise<void>;
  /** Infer how dropped files should be prepared; asks for resolution when ambiguous. */
  addDroppedPaths: (paths: string[]) => Promise<void>;
  /** Apply dropped files to a known prepare task, bypassing inference. */
  addDroppedPathsToTab: (tab: PrepareTab, paths: string[]) => Promise<void>;
  setSelectedAction: (action: PrepareAction) => void;
  resolvePendingDrop: (tab: PrepareTab) => Promise<void>;
  clearPendingDrop: () => void;
  reset: () => void;
}

export type PrepareStore = PrepareState & PrepareActions;

export function tabKind(tab: PrepareTab): JoinKind | null {
  return tab === "join-output" ? "output" : tab === "join-remaining" ? "remaining" : null;
}

const emptyJoin = (): JoinState => ({
  files: [],
  crossFileIssues: [],
  totalRows: 0,
  result: null,
});

const initialState = (): PrepareState => ({
  selectedAction: null,
  tab: "split",
  busy: false,
  error: null,
  pendingDrop: null,
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

function tabForKind(kind: JoinKind): PrepareTab {
  return kind === "output" ? "join-output" : "join-remaining";
}

function labelForTab(tab: PrepareTab): string {
  switch (tab) {
    case "split":
      return "Split source";
    case "join-output":
      return "Join outputs";
    case "join-remaining":
      return "Join remaining";
  }
}

function countIssues(issues: readonly ValidationIssue[]): { errors: number; warnings: number } {
  const errors = issues.filter((i) => i.severity === "error").length;
  return { errors, warnings: issues.length - errors };
}

function summarizeSplit(
  paths: readonly string[],
  response: SplitAnalyzeResponse,
): DropResolutionSummary {
  const issues = countIssues(response.file?.issues ?? []);
  return {
    tab: "split",
    label: labelForTab("split"),
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
  };
}

function summarizeJoin(tab: PrepareTab, response: JoinAnalyzeResponse): DropResolutionSummary {
  const fileIssues = (response.files ?? []).flatMap((file) => file.issues);
  const crossIssues = response.crossFileIssues ?? [];
  const issues = countIssues([...fileIssues, ...crossIssues]);
  return {
    tab,
    label: labelForTab(tab),
    ok: response.ok,
    fileCount: response.files?.length ?? 0,
    totalRows: response.totalRows ?? 0,
    errors: issues.errors,
    warnings: issues.warnings,
    message: response.error,
  };
}

export const usePrepareStore = create<PrepareStore>((set, get) => {
  function applySplitAnalyze(response: SplitAnalyzeResponse): void {
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

  function applyJoinAnalyze(kind: JoinKind, response: JoinAnalyzeResponse): void {
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

  async function analyzeJoinPaths(kind: JoinKind, paths: string[]): Promise<void> {
    if (paths.length === 0) {
      set({ busy: false, join: { ...get().join, [kind]: emptyJoin() } });
      return;
    }
    applyJoinAnalyze(kind, await window.api.analyzeJoinFiles({ kind, paths }));
  }

  async function applyDroppedPathsToTab(tab: PrepareTab, paths: string[]): Promise<void> {
    const clean = unique(paths);
    if (clean.length === 0) return;
    set({ selectedAction: tab, tab, error: null, pendingDrop: null });
    const kind = tabKind(tab);
    if (!kind) {
      await get().analyzeSplitPath(clean[0]!);
      return;
    }
    set({ busy: true });
    const existing = get().join[kind].files.map((f) => f.path);
    await analyzeJoinPaths(kind, unique([...existing, ...clean]));
  }

  async function buildDropResolution(paths: string[]): Promise<PendingDropResolution> {
    const [split, output, remaining] = await Promise.all([
      window.api.analyzeSplitFile(paths[0]!),
      window.api.analyzeJoinFiles({ kind: "output", paths }),
      window.api.analyzeJoinFiles({ kind: "remaining", paths }),
    ]);
    return {
      paths,
      summaries: [
        summarizeSplit(paths, split),
        summarizeJoin("join-output", output),
        summarizeJoin("join-remaining", remaining),
      ],
    };
  }

  return {
    ...initialState(),

    setTab(tab) {
      set({ selectedAction: tab, tab, error: null, pendingDrop: null });
    },

    setSelectedAction(action) {
      set({
        selectedAction: action,
        tab: action ?? get().tab,
        error: null,
        pendingDrop: null,
      });
    },

    async pickSplitFile() {
      set({ busy: true, pendingDrop: null });
      applySplitAnalyze(await window.api.pickSplitFile());
    },

    async analyzeSplitPath(path) {
      set({ busy: true, pendingDrop: null });
      applySplitAnalyze(await window.api.analyzeSplitFile(path));
    },

    clearSplitFile() {
      set({
        split: { file: null, parts: get().split.parts, result: null },
        error: null,
        pendingDrop: null,
      });
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
      set({ busy: true, pendingDrop: null });
      const existing = get().join[kind].files.map((f) => f.path);
      const response = await window.api.pickJoinFiles(kind);
      if (response.canceled) {
        set({ busy: false });
        return;
      }
      const picked = (response.files ?? []).map((f) => f.path);
      const merged = [...new Set([...existing, ...picked])];
      // A pick into an empty list is already the full analysis; otherwise the
      // union of old + new files must be re-analyzed as one set.
      if (existing.length === 0) applyJoinAnalyze(kind, response);
      else await analyzeJoinPaths(kind, merged);
    },

    async removeJoinFile(kind, path) {
      set({ busy: true, pendingDrop: null });
      const rest = get()
        .join[kind].files.map((f) => f.path)
        .filter((p) => p !== path);
      await analyzeJoinPaths(kind, rest);
    },

    async runJoin(kind) {
      const paths = get().join[kind].files.map((f) => f.path);
      if (paths.length === 0) return;
      set({ busy: true, pendingDrop: null });
      const result = await window.api.runJoin({ kind, paths });
      set({ busy: false });
      if (result.canceled) return;
      set({ join: { ...get().join, [kind]: { ...get().join[kind], result } } });
    },

    async addDroppedPaths(paths) {
      const clean = unique(paths);
      if (clean.length === 0) return;

      const { selectedAction } = get();
      if (selectedAction) {
        await applyDroppedPathsToTab(selectedAction, clean);
        return;
      }

      const hintedKinds = clean.map(joinKindFromName);
      const explicitKinds = hintedKinds.filter((k): k is JoinKind => Boolean(k));
      const allHintedSame =
        explicitKinds.length === clean.length && explicitKinds.every((k) => k === explicitKinds[0]);

      if (allHintedSame) {
        await applyDroppedPathsToTab(tabForKind(explicitKinds[0]!), clean);
        return;
      }

      if (clean.length === 1 && explicitKinds.length === 0) {
        await applyDroppedPathsToTab("split", clean);
        return;
      }

      set({ busy: true, pendingDrop: null, error: null });
      const resolution = await buildDropResolution(clean);
      const joinOptions = resolution.summaries.filter((s) => s.tab !== "split" && s.ok);
      if (explicitKinds.length === 0 && joinOptions.length === 1) {
        set({ busy: false });
        await applyDroppedPathsToTab(joinOptions[0]!.tab, clean);
        return;
      }
      set({ busy: false, pendingDrop: resolution });
    },

    async addDroppedPathsToTab(tab, paths) {
      await applyDroppedPathsToTab(tab, paths);
    },

    async resolvePendingDrop(tab) {
      const pending = get().pendingDrop;
      if (!pending) return;
      await applyDroppedPathsToTab(tab, pending.paths);
    },

    clearPendingDrop() {
      set({ pendingDrop: null });
    },

    reset() {
      set(initialState());
    },
  };
});
