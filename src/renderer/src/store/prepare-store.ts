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
  tab: PrepareTab;
  busy: boolean;
  error: string | null;
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
  /** Route window drops by the active tab (split: first file; join: append). */
  addDroppedPaths: (paths: string[]) => Promise<void>;
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
  tab: "split",
  busy: false,
  error: null,
  split: { file: null, parts: 2, result: null },
  join: { output: emptyJoin(), remaining: emptyJoin() },
});

function clampParts(parts: number, rowCount: number): number {
  return Math.max(2, Math.min(Math.round(parts), Math.max(2, rowCount)));
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

  return {
    ...initialState(),

    setTab(tab) {
      set({ tab, error: null });
    },

    async pickSplitFile() {
      set({ busy: true });
      applySplitAnalyze(await window.api.pickSplitFile());
    },

    async analyzeSplitPath(path) {
      set({ busy: true });
      applySplitAnalyze(await window.api.analyzeSplitFile(path));
    },

    clearSplitFile() {
      set({ split: { file: null, parts: get().split.parts, result: null }, error: null });
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
      const merged = [...new Set([...existing, ...picked])];
      // A pick into an empty list is already the full analysis; otherwise the
      // union of old + new files must be re-analyzed as one set.
      if (existing.length === 0) applyJoinAnalyze(kind, response);
      else await analyzeJoinPaths(kind, merged);
    },

    async removeJoinFile(kind, path) {
      set({ busy: true });
      const rest = get()
        .join[kind].files.map((f) => f.path)
        .filter((p) => p !== path);
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

    async addDroppedPaths(paths) {
      if (paths.length === 0) return;
      const { tab } = get();
      const kind = tabKind(tab);
      if (!kind) {
        await get().analyzeSplitPath(paths[0]!);
        return;
      }
      set({ busy: true });
      const existing = get().join[kind].files.map((f) => f.path);
      await analyzeJoinPaths(kind, [...new Set([...existing, ...paths])]);
    },

    reset() {
      set(initialState());
    },
  };
});
