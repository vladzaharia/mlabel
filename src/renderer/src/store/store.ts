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
  ValidationIssue,
} from "@core";
import { debounce } from "../lib/utils";

export type Phase =
  | "boot"
  | "need-config"
  | "config-invalid"
  | "need-input"
  | "input-invalid"
  | "labeling"
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

  index: number;
  labels: Record<number, LabelMap>;
  exportResult: ExportResponse | null;
}

interface AppActions {
  bootstrap: () => Promise<void>;
  setSystemDark: (dark: boolean) => void;
  cycleTheme: () => void;
  setColorTheme: (theme: ColorTheme) => void;

  pickConfig: () => Promise<void>;
  pickInput: () => Promise<void>;
  loadInputPath: (path: string) => Promise<void>;

  applyResume: () => void;
  dismissResume: () => void;

  setLabel: (index: number, field: string, value: CoercedValue | null) => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;

  submitDone: () => Promise<{ ok: boolean; error?: string }>;
  backToLabeling: () => void;
  backToConfig: () => void;
  resetInput: () => void;
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

  index: 0,
  labels: {},
  exportResult: null,

  async bootstrap() {
    applyColorTheme(get().colorTheme);
    const systemDark = await window.api.getTheme();
    set({ systemDark });
    applyThemeClass(resolveDark(get().themeMode, systemDark));

    const response = await window.api.getStartupConfig();
    if (response.status === "loaded") {
      set({ config: response.config, configPath: response.path, phase: "need-input" });
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
        phase: "need-input",
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
    });
  },

  dismissResume() {
    set({ pendingResume: null });
    void window.api.clearSession();
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

  goTo(index) {
    const max = Math.max(0, get().records.length - 1);
    set({ index: Math.max(0, Math.min(index, max)) });
  },

  async submitDone() {
    set({ busy: true });
    const result = await window.api.exportLabels({ labels: get().labels });
    set({ busy: false });
    if (result.ok) {
      set({ exportResult: result, phase: "done" });
      void window.api.clearSession();
      return { ok: true };
    }
    return { ok: false, error: result.error };
  },

  backToLabeling() {
    set({ phase: "labeling" });
  },

  /** Return to the config picker to switch configs; clears any loaded input. */
  backToConfig() {
    set({
      phase: "need-config",
      inputPath: null,
      records: [],
      headerIssues: [],
      labels: {},
      index: 0,
      exportResult: null,
      pendingResume: null,
      error: null,
    });
  },

  resetInput() {
    set({
      inputPath: null,
      records: [],
      headerIssues: [],
      labels: {},
      index: 0,
      exportResult: null,
      phase: "need-input",
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
  const labels: Record<number, LabelMap> = {};
  for (const record of records) labels[record.index] = { ...record.labelValues };
  // Only offer to resume when the saved session holds real progress; otherwise
  // there is nothing to restore, so start fresh without prompting.
  const resume = response.resume ?? null;
  set({
    busy: false,
    inputPath: response.path ?? null,
    records,
    headerIssues: response.headerIssues ?? [],
    pendingResume: resume && sessionHasChanges(resume, records) ? resume : null,
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

// --- Autosave: persist labels + index to the main process (debounced). ---
const persist = debounce((data: SessionData) => void window.api.saveSession(data), 400);
useStore.subscribe((state) => {
  if (state.phase === "labeling" && state.configPath && state.inputPath) {
    persist({
      configPath: state.configPath,
      inputPath: state.inputPath,
      index: state.index,
      labels: state.labels,
    });
  }
});
