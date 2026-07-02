import { create } from "zustand";
import { evaluateRecord, sessionHasChanges } from "@core";
import type {
  AppConfig,
  CoercedValue,
  ConfigIssue,
  ExportResponse,
  InputLoadResponse,
  LabelMap,
  RecordView,
  SessionData,
  UpdateStatus,
  ValidationIssue,
} from "@core";
import { usePrepareStore } from "./prepare-store";
import { announce } from "../a11y/announcer";

export type Phase =
  | "boot"
  | "need-config"
  | "config-invalid"
  | "select-mode"
  | "need-input"
  | "input-invalid"
  | "labeling"
  | "prepare"
  | "done";
export type ThemeMode = "system" | "light" | "dark";
export type ColorTheme = "cobalt" | "parchment" | "fjord" | "vespers";

/** User-facing color themes; `swatch` is the light accent shown in the picker. */
export const COLOR_THEMES: { id: ColorTheme; name: string; swatch: string }[] = [
  { id: "cobalt", name: "Cobalt Cathedral", swatch: "oklch(0.55 0.2 265)" },
  { id: "parchment", name: "Parchment Parlour", swatch: "oklch(0.57 0.09 130)" },
  { id: "fjord", name: "Frostbound Fjord", swatch: "oklch(0.55 0.15 235)" },
  { id: "vespers", name: "Velvet Vespers", swatch: "oklch(0.53 0.2 300)" },
];

interface AppState {
  themeMode: ThemeMode;
  colorTheme: ColorTheme;
  systemDark: boolean;

  phase: Phase;
  busy: boolean;
  error: string | null;

  config: AppConfig | null;
  configPath: string | null;
  configIssues: ConfigIssue[];

  inputPath: string | null;
  records: RecordView[];
  headerIssues: ValidationIssue[];
  pendingResume: SessionData | null;
  /**
   * True when the pending resume's source fingerprint does not match the current
   * file (stale session). Renderer shows a warning and inverts button emphasis.
   */
  pendingResumeStale: boolean;

  index: number;
  labels: Record<number, LabelMap>;
  exportResult: ExportResponse | null;
  exportError: string | null;

  /** Latest auto-update status pushed from main; `null` until the first event. */
  updateStatus: UpdateStatus | null;
}

interface AppActions {
  bootstrap: () => Promise<void>;
  setSystemDark: (dark: boolean) => void;
  setUpdateStatus: (status: UpdateStatus) => void;
  cycleTheme: () => void;
  setColorTheme: (theme: ColorTheme) => void;

  pickConfig: () => Promise<void>;
  pickInput: () => Promise<void>;
  loadInputPath: (path: string) => Promise<void>;

  chooseLabeling: () => void;
  choosePrepare: () => void;
  backToModeSelect: () => void;

  applyResume: () => void;
  dismissResume: () => void;
  deferResume: () => void;
  clearExportError: () => void;

  setLabel: (index: number, field: string, value: CoercedValue | null) => void;
  next: () => void;
  prev: () => void;

  submitDone: () => Promise<void>;
  backToLabeling: () => void;
  backToConfig: () => void;
}

export type AppStore = AppState & AppActions;

const THEME_KEY = "mlabel.theme";
const COLOR_THEME_KEY = "mlabel.colortheme";

function readThemeMode(): ThemeMode {
  const saved = globalThis.localStorage?.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

function readColorTheme(): ColorTheme {
  const saved = globalThis.localStorage?.getItem(COLOR_THEME_KEY);
  return COLOR_THEMES.some((t) => t.id === saved) ? (saved as ColorTheme) : "cobalt";
}

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === "system" ? systemDark : mode === "dark";
}

function applyThemeClass(dark: boolean): void {
  globalThis.document?.documentElement.classList.toggle("dark", dark);
}

function applyColorTheme(theme: ColorTheme): void {
  if (globalThis.document) globalThis.document.documentElement.dataset.theme = theme;
}

export const useStore = create<AppStore>((set, get) => ({
  themeMode: readThemeMode(),
  colorTheme: readColorTheme(),
  systemDark: true,

  phase: "boot",
  busy: false,
  error: null,

  config: null,
  configPath: null,
  configIssues: [],

  inputPath: null,
  records: [],
  headerIssues: [],
  pendingResume: null,
  pendingResumeStale: false,

  index: 0,
  labels: {},
  exportResult: null,
  exportError: null,

  updateStatus: null,

  async bootstrap() {
    applyColorTheme(get().colorTheme);
    const systemDark = await window.api.getTheme();
    set({ systemDark });
    applyThemeClass(resolveDark(get().themeMode, systemDark));

    const response = await window.api.getStartupConfig();
    if (response.status === "loaded") {
      set({ config: response.config, configPath: response.path, phase: "select-mode" });
    } else if (response.status === "invalid") {
      set({
        configIssues: response.issues,
        configPath: response.path ?? null,
        phase: "config-invalid",
      });
    } else {
      set({ phase: "need-config" });
    }
  },

  setSystemDark(dark) {
    set({ systemDark: dark });
    applyThemeClass(resolveDark(get().themeMode, dark));
  },

  setUpdateStatus(status) {
    set({ updateStatus: status });
  },

  cycleTheme() {
    const order: ThemeMode[] = ["system", "light", "dark"];
    const nextMode = order[(order.indexOf(get().themeMode) + 1) % order.length]!;
    set({ themeMode: nextMode });
    globalThis.localStorage?.setItem(THEME_KEY, nextMode);
    applyThemeClass(resolveDark(nextMode, get().systemDark));
  },

  setColorTheme(theme) {
    set({ colorTheme: theme });
    globalThis.localStorage?.setItem(COLOR_THEME_KEY, theme);
    applyColorTheme(theme);
  },

  async pickConfig() {
    set({ busy: true });
    const response = await window.api.pickConfig();
    if (response.status === "loaded") {
      set({
        config: response.config,
        configPath: response.path,
        configIssues: [],
        phase: "select-mode",
        busy: false,
      });
    } else if (response.status === "invalid") {
      set({
        configIssues: response.issues,
        configPath: response.path ?? null,
        phase: "config-invalid",
        busy: false,
      });
    } else {
      set({ busy: false });
    }
  },

  chooseLabeling() {
    set({ phase: "need-input" });
  },

  choosePrepare() {
    set({ phase: "prepare" });
  },

  /** Return to the mode choice; clears any loaded input (labels are autosaved). */
  backToModeSelect() {
    set({
      phase: "select-mode",
      inputPath: null,
      records: [],
      headerIssues: [],
      labels: {},
      index: 0,
      exportResult: null,
      pendingResume: null,
      pendingResumeStale: false,
      error: null,
    });
  },

  async pickInput() {
    set({ busy: true });
    applyInputResponse(set, await window.api.pickInput());
  },

  async loadInputPath(path) {
    set({ busy: true });
    applyInputResponse(set, await window.api.loadInput(path));
  },

  applyResume() {
    const resume = get().pendingResume;
    if (!resume) return;
    set({
      labels: resume.labels,
      index: Math.min(resume.index, Math.max(0, get().records.length - 1)),
      pendingResume: null,
      pendingResumeStale: false,
    });
  },

  /** Permanently discard the saved session — "start fresh" semantics. */
  dismissResume() {
    set({ pendingResume: null, pendingResumeStale: false });
    void window.api.clearSession();
  },

  /** Clear the resume prompt without deleting the saved session — "not now" semantics. */
  deferResume() {
    set({ pendingResume: null, pendingResumeStale: false });
  },

  clearExportError() {
    set({ exportError: null });
  },

  setLabel(index, field, value) {
    const labels = get().labels;
    set({ labels: { ...labels, [index]: { ...labels[index], [field]: value } } });
  },

  next() {
    const { index, records } = get();
    if (index < records.length - 1) set({ index: index + 1 });
  },

  prev() {
    const { index } = get();
    if (index > 0) set({ index: index - 1 });
  },

  async submitDone() {
    set({ busy: true, exportError: null });
    const result = await window.api.exportLabels({ labels: get().labels });
    set({ busy: false });
    if (result.ok) {
      const n = result.completeCount ?? 0;
      announce(`Export complete, ${String(n)} record${n === 1 ? "" : "s"} exported`, "assertive");
      // phase: "done" must be set BEFORE clearSession() is called. Electron
      // does not order messages across separate IPC channels, so the autosave
      // subscriber (which bails when phase !== "labeling") could otherwise race
      // a clearSession on a different channel and overwrite a cleared session.
      set({ exportResult: result, phase: "done" });
      await window.api.clearSession();
      return;
    }
    const errMsg = result.error ?? "unknown error";
    announce(`Export failed: ${errMsg}`, "assertive");
    set({ exportError: errMsg });
  },

  backToLabeling() {
    set({ phase: "labeling" });
  },

  /** Return to the config picker to switch configs; clears any loaded input. */
  backToConfig() {
    usePrepareStore.getState().reset();
    set({
      phase: "need-config",
      inputPath: null,
      records: [],
      headerIssues: [],
      labels: {},
      index: 0,
      exportResult: null,
      pendingResume: null,
      pendingResumeStale: false,
      error: null,
    });
  },
}));

type SetFn = (partial: Partial<AppStore>) => void;

function applyInputResponse(set: SetFn, response: InputLoadResponse): void {
  if (response.canceled) {
    set({ busy: false });
    return;
  }
  if (!response.ok) {
    set({
      busy: false,
      headerIssues: response.headerIssues ?? [],
      inputPath: response.path ?? null,
      error: response.error ?? "Failed to load input.",
      phase: "input-invalid",
    });
    return;
  }
  const records = response.records ?? [];
  if (records.length === 0) {
    set({
      busy: false,
      headerIssues: response.headerIssues ?? [],
      inputPath: response.path ?? null,
      error: "This file has no data rows to label.",
      phase: "input-invalid",
    });
    return;
  }
  const labels: Record<number, LabelMap> = {};
  for (const record of records) labels[record.index] = { ...record.labelValues };
  // Only offer to resume when the saved session holds real progress; otherwise
  // there is nothing to restore, so start fresh without prompting.
  const resume = response.resume ?? null;
  const pendingResume = resume && sessionHasChanges(resume, records) ? resume : null;
  set({
    busy: false,
    inputPath: response.path ?? null,
    records,
    headerIssues: response.headerIssues ?? [],
    pendingResume,
    // Legacy sessions ship resumeStale=undefined (unverified, treated as not stale).
    pendingResumeStale: pendingResume !== null ? (response.resumeStale ?? false) : false,
    labels,
    index: 0,
    error: null,
    phase: "labeling",
  });
}

/** Completed-record count, recomputed from labels (drives the progress bar). */
export function selectCompletedCount(state: AppStore): number {
  const { config, records, labels } = state;
  if (!config) return 0;
  const names = new Set(config.input.fields.map((f) => f.name));
  let n = 0;
  for (const record of records) {
    const values = labels[record.index] ?? record.labelValues;
    if (evaluateRecord(values, config.output.fields, names).status === "complete") n += 1;
  }
  return n;
}

export const selectCurrentRecord = (state: AppStore): RecordView | undefined =>
  state.records[state.index];

// --- Autosave: write-through on every labeling-relevant state change. ---
// Using the two-arg subscriber so we can bail out when only unrelated state
// (e.g. updateStatus, themeMode) changes — avoiding unnecessary IPC traffic.
useStore.subscribe((state, prev) => {
  // Guard on phase === "labeling" before issuing saveSession. submitDone() sets
  // phase: "done" synchronously before calling clearSession() on a separate IPC
  // channel; this guard is what prevents a saveSession from racing that
  // clearSession — Electron provides no ordering guarantee across channels.
  if (state.phase !== "labeling" || !state.configPath || !state.inputPath) return;
  // Only IPC when something meaningful to the session actually changed.
  if (
    state.labels === prev.labels &&
    state.index === prev.index &&
    state.configPath === prev.configPath &&
    state.inputPath === prev.inputPath
  )
    return;
  void window.api.saveSession({
    configPath: state.configPath,
    inputPath: state.inputPath,
    index: state.index,
    labels: state.labels,
  });
});
