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
function recommendOp(paths: readonly string[], proposals: readonly OpProposal[]): PrepareOp | null {
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
    set({ busy: true, error: null });
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
      set({ busy: true, error: null });
      const result = await window.api.runSplit({ path: split.file.path, parts: split.parts });
      set({ busy: false, split: { ...get().split, result } });
    },

    async pickJoinFiles(kind) {
      set({ busy: true, error: null });
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
      set({ busy: true, error: null });
      const result = await window.api.runJoin({ kind, paths });
      if (result.canceled) {
        set({ busy: false });
        return;
      }
      set({ busy: false, join: { ...get().join, [kind]: { ...get().join[kind], result } } });
    },

    reset() {
      set(initialState());
    },
  };
});
