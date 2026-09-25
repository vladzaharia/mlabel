import { create } from "zustand";
import { DEFAULT_MODEL_ID } from "@core";
import type { Analysis, AppSettings, EngineState, ShortcutOverrides } from "@core";
import {
  evaluateRecord,
  findIncomplete,
  resolveLabelValues,
  reviveLabelMap,
  sessionAnswered,
  sessionFields,
  sessionHasChanges,
  stampLabelTime,
} from "@core";
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
  | "need-input"
  | "input-invalid"
  | "need-prefill"
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
  /** Everything the labeler has set. `settings.json` is the source of truth. */
  settings: AppSettings;
  /**
   * Chord overrides, lifted out of `settings` so the provider can select on
   * them without re-resolving every time an unrelated preference changes.
   */
  shortcutOverrides: ShortcutOverrides;
  /** What the inference engine can do right now. */
  aiState: EngineState;
  /** Findings by record index, pushed from main as they land. */
  analyses: Record<number, Analysis>;
  /** Which models are on this machine. */
  downloadedModels: string[];
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
  /** Answers given once per file, merged into every exported row. */
  prefill: LabelMap;
  exportResult: ExportResponse | null;
  exportError: string | null;

  /** Latest auto-update status pushed from main; `null` until the first event. */
  updateStatus: UpdateStatus | null;

  /**
   * Current user-selected mode. Source of truth for the Mode menu radio state.
   * Drives the menu-context subscriber — keeps menu in sync without imperative calls.
   */
  mode: "label" | "prepare";
}

interface AppActions {
  bootstrap: () => Promise<void>;
  setSystemDark: (dark: boolean) => void;
  setUpdateStatus: (status: UpdateStatus) => void;
  cycleTheme: () => void;
  setColorTheme: (theme: ColorTheme) => void;
  /** Merge a patch into the persisted settings. */
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** Throw away the in-progress labels and the saved session with them. */
  clearSessionData: () => Promise<void>;
  setAiState: (state: EngineState) => void;
  setAnalysis: (analysis: Analysis) => void;
  refreshAi: () => Promise<void>;

  pickConfig: () => Promise<void>;
  pickInput: () => Promise<void>;
  loadInputPath: (path: string) => Promise<void>;

  /**
   * Switch between label/prepare modes in response to a native menu command.
   * No-op when no config is loaded. Also used internally by menu-exclusive
   * mode switching (the old ModeSelectScreen is gone).
   */
  setMode: (mode: "label" | "prepare") => void;

  /**
   * Return to the input picker (clears loaded input + labels).
   * Replaces the old backToModeSelect — there is no mode-select screen any more.
   */
  backToInput: () => void;

  applyResume: () => void;
  dismissResume: () => void;
  deferResume: () => void;
  clearExportError: () => void;

  setLabel: (index: number, field: string, value: CoercedValue | null) => void;
  setPrefill: (field: string, value: CoercedValue | null) => void;
  /** Leave the setup step for the labeling screen. */
  startLabeling: () => void;
  next: () => void;
  prev: () => void;
  /** Jump to the nearest record that still needs work, in either direction. */
  gotoIncomplete: (direction: 1 | -1) => void;

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

/**
 * Keep the two theme keys in localStorage as a **paint cache**, not a source of
 * truth.
 *
 * `settings.json` is authoritative, but reading it is asynchronous — and the
 * store resolves the theme synchronously at `create()` time so the very first
 * paint is already correct. Dropping the cache would reintroduce a flash of the
 * wrong theme on every launch. Nothing reads these for anything but that first
 * frame; `bootstrap` reconciles immediately after.
 */
function cacheTheme(key: string, value: string): void {
  globalThis.localStorage?.setItem(key, value);
}

/** Apply settings to the live app, and mirror the bits the store selects on. */
function applySettings(
  set: (patch: Partial<AppStore>) => void,
  settings: AppSettings,
  systemDark?: boolean,
): void {
  set({
    settings,
    themeMode: settings.themeMode,
    colorTheme: settings.colorTheme,
    shortcutOverrides: settings.shortcuts,
  });
  cacheTheme(THEME_KEY, settings.themeMode);
  cacheTheme(COLOR_THEME_KEY, settings.colorTheme);
  applyColorTheme(settings.colorTheme);
  if (systemDark !== undefined) applyThemeClass(resolveDark(settings.themeMode, systemDark));
}

/**
 * Read the persisted settings, seeding them from the paint cache the first time.
 *
 * A labeler upgrading from a build that only had localStorage keeps the theme
 * they chose: if `settings.json` has never been written, whatever the cache
 * holds is the best record of their preference there is.
 */
async function loadSettings(
  set: (patch: Partial<AppStore>) => void,
  get: () => AppStore,
): Promise<void> {
  let settings = await window.api.getSettings();
  const cachedMode = readThemeMode();
  const cachedColor = readColorTheme();
  const untouched = settings.themeMode === "system" && settings.colorTheme === "cobalt";
  if (untouched && (cachedMode !== "system" || cachedColor !== "cobalt")) {
    settings = await window.api.setSettings({ themeMode: cachedMode, colorTheme: cachedColor });
  }
  applySettings(set, settings, get().systemDark);
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
  settings: {
    version: 1,
    themeMode: readThemeMode(),
    colorTheme: readColorTheme(),
    shortcuts: {},
    updateChecks: true,
    aiEnabled: false,
    // Derived, not repeated: this is the store's pre-IPC placeholder, and a
    // stale copy here would quietly disagree with the main process.
    aiModelId: DEFAULT_MODEL_ID,
  },
  shortcutOverrides: {},
  aiState: { kind: "no-model" },
  analyses: {},
  downloadedModels: [],
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
  prefill: {},
  exportResult: null,
  exportError: null,

  updateStatus: null,

  mode: "label",

  async bootstrap() {
    applyColorTheme(get().colorTheme);
    const systemDark = await window.api.getTheme();
    set({ systemDark });
    applyThemeClass(resolveDark(get().themeMode, systemDark));

    await loadSettings(set, get);

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

    // Push once unconditionally. The menu-context subscriber only fires on a
    // *change*, so a no-config startup never notified main at all — leaving the
    // native Mode menu enabled and checked while the app sat on the config picker.
    const { config, mode } = get();
    void window.api.setMenuContext({ configLoaded: config !== null, mode });
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
    cacheTheme(THEME_KEY, nextMode);
    applyThemeClass(resolveDark(nextMode, get().systemDark));
    void get().updateSettings({ themeMode: nextMode });
  },

  setColorTheme(theme) {
    set({ colorTheme: theme });
    cacheTheme(COLOR_THEME_KEY, theme);
    applyColorTheme(theme);
    void get().updateSettings({ colorTheme: theme });
  },

  setAiState(state) {
    set({ aiState: state });
    // A finished download changes what is on disk, which the settings pane
    // shows; nothing else would notice.
    if (state.kind === "ready" || state.kind === "no-model") void get().refreshAi();
  },

  setAnalysis(analysis) {
    set({ analyses: { ...get().analyses, [analysis.recordIndex]: analysis } });
  },

  async refreshAi() {
    const status = await window.api.getAiStatus();
    set({
      aiState: status.state,
      downloadedModels: status.downloaded,
      analyses: Object.fromEntries(status.cached.map((a) => [a.recordIndex, a])),
    });
  },

  async updateSettings(patch) {
    // Optimistic, then reconciled: the handler sanitises, so what comes back is
    // what is actually on disk rather than what was asked for.
    set({ settings: { ...get().settings, ...patch } });
    const settings = await window.api.setSettings(patch);
    applySettings(set, settings);
  },

  async clearSessionData() {
    const { records, config } = get();
    const labels: Record<number, LabelMap> = {};
    // Reseed rather than empty: the auto-copied input values were never the
    // labeler's answers, and throwing them away would leave copied columns
    // blank on export.
    for (const record of records) labels[record.index] = { ...record.labelValues };

    // State first, `clearSession()` second. The autosave subscriber fires on
    // this `set` and pushes a fresh save; the write queue is latest-wins and
    // ordered, so the clear pushed afterwards is the one that lands. Reversing
    // these two lines resurrects the session. `submitDone` relies on the same
    // ordering for the same reason.
    const stillNeedsPrefill = sessionFields(config?.output.fields ?? []).length > 0;
    set({
      labels,
      prefill: {},
      index: 0,
      pendingResume: null,
      pendingResumeStale: false,
      phase: stillNeedsPrefill ? "need-prefill" : "labeling",
    });
    await window.api.clearSession();
    announce("Session cleared", "assertive");
  },

  async pickConfig() {
    set({ busy: true, error: null });
    try {
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
    } catch (err) {
      set({ busy: false, error: describeError(err) });
    }
  },

  setMode(mode) {
    const { config, records, busy } = get();
    // A picker is open. Switching now would leave phase and mode disagreeing
    // once the pick resolves — the labeling screen with the menu on "Prepare".
    if (!config || busy) return;
    if (mode === "prepare") {
      set({ phase: "prepare", mode: "prepare" });
      announce("Prepare mode", "polite");
    } else {
      // Label mode: go to labeling if records loaded, else input picker.
      const resumePhase =
        records.length === 0
          ? "need-input"
          : needsPrefill(config, get().prefill)
            ? "need-prefill"
            : "labeling";
      set({ phase: resumePhase, mode: "label" });
      announce("Labeling mode", "polite");
    }
  },

  /** Return to the input picker; clears any loaded input (labels are autosaved). */
  backToInput() {
    void window.api.unloadInput();
    set({
      phase: "need-input",
      mode: "label",
      inputPath: null,
      records: [],
      headerIssues: [],
      labels: {},
      index: 0,
      exportResult: null,
      exportError: null,
      pendingResume: null,
      pendingResumeStale: false,
      error: null,
      busy: false,
    });
  },

  async pickInput() {
    set({ busy: true });
    try {
      applyInputResponse(set, await window.api.pickInput(), get().config, get().prefill);
    } catch (err) {
      set({ busy: false, error: describeError(err) });
    }
  },

  async loadInputPath(path) {
    set({ busy: true });
    try {
      applyInputResponse(set, await window.api.loadInput(path), get().config, get().prefill);
    } catch (err) {
      set({ busy: false, error: describeError(err) });
    }
  },

  applyResume() {
    const { pendingResume: resume, config, records } = get();
    if (!resume) return;
    // Re-type on the way in: JSON persistence flattens Dates to strings, and an
    // un-revived map makes a finished record read as incomplete (see reviveLabelMap).
    // Without a config there is nothing to revive against, so pass the saved
    // labels through rather than dropping the resume entirely.
    const labels: Record<number, LabelMap> = {};
    for (const [index, saved] of Object.entries(resume.labels)) {
      labels[Number(index)] = config ? reviveLabelMap(saved, config.output.fields) : saved;
    }
    set({
      labels,
      // Keep whatever was answered before if the saved session predates prefill.
      prefill: resume.prefill ?? get().prefill,
      index: Math.min(resume.index, Math.max(0, records.length - 1)),
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
    const { labels, prefill, config } = get();
    const updated: LabelMap = { ...labels[index], [field]: value };
    // Stamped inside the same set() as the edit, so autosave still fires once
    // per keystroke rather than twice.
    const stamped = config
      ? stampLabelTime(updated, prefill, config.output.fields, () => new Date())
      : updated;
    set({ labels: { ...labels, [index]: stamped } });
  },

  setPrefill(field, value) {
    set({ prefill: { ...get().prefill, [field]: value } });
  },

  startLabeling() {
    if (get().phase === "need-prefill") set({ phase: "labeling" });
  },

  next() {
    const { index, records } = get();
    if (index < records.length - 1) set({ index: index + 1 });
  },

  prev() {
    const { index } = get();
    if (index > 0) set({ index: index - 1 });
  },

  /**
   * Finding the gaps is otherwise O(n) manual stepping with no signal on
   * arrival — the difference between a guided sweep and a bad afternoon.
   */
  gotoIncomplete(direction) {
    const state = get();
    if (!state.config) return;
    const found = findIncomplete(
      state.index,
      direction,
      state.records.length,
      recordIsComplete(state),
    );
    if (found === null) {
      // Previously a silent no-op, which reads as a broken key — and would read
      // the same way through the new toolbar buttons.
      announce(`No unfinished records ${direction === 1 ? "ahead" : "behind"}.`);
      return;
    }
    set({ index: found });
  },

  async submitDone() {
    set({ busy: true, exportError: null });
    let result: ExportResponse;
    try {
      result = await window.api.exportLabels({ labels: get().labels, prefill: get().prefill });
    } catch (err) {
      set({ busy: false, exportError: describeError(err) });
      return;
    }
    set({ busy: false });
    if (result.ok) {
      const n = result.completeCount ?? 0;
      announce(`Export complete, ${String(n)} record${n === 1 ? "" : "s"} exported`, "assertive");
      // phase: "done" must be set BEFORE clearSession() is called. Both calls
      // share one ordered main-side IPC queue once received, and the export
      // round-trip drains any in-flight saveSession calls before clearSession
      // is pushed — making the autosave-vs-clear race practically impossible.
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
    void window.api.unloadConfig();
    set({
      phase: "need-config",
      mode: "label",
      prefill: {},
      config: null,
      configPath: null,
      configIssues: [],
      inputPath: null,
      records: [],
      headerIssues: [],
      labels: {},
      index: 0,
      exportResult: null,
      exportError: null,
      pendingResume: null,
      pendingResumeStale: false,
      error: null,
      busy: false,
    });
  },
}));

/** A rejected IPC call must never strand `busy` — that disables the whole UI. */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type SetFn = (partial: Partial<AppStore>) => void;

/** True when the config asks session questions that are not yet answered. */
function needsPrefill(config: AppConfig | null, prefill: LabelMap): boolean {
  if (!config) return false;
  return (
    sessionFields(config.output.fields).length > 0 &&
    !sessionAnswered(prefill, config.output.fields)
  );
}

function applyInputResponse(
  set: SetFn,
  response: InputLoadResponse,
  config: AppConfig | null,
  prefill: LabelMap,
): void {
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
    // The previous file's export outcome says nothing about this one.
    exportError: null,
    exportResult: null,
    // The setup step only appears when the config asks something that has not
    // been answered yet, so a config without session fields never sees it.
    phase: needsPrefill(config, prefill) ? "need-prefill" : "labeling",
  });
}

/** Completed-record count, recomputed from labels (drives the progress bar). */
/**
 * Whether one record needs no more work.
 *
 * The merge — a record's own seeded values, overlaid by anything the labeler
 * typed, then resolved against the session answers — has to be identical
 * everywhere it is asked, or the progress count and the jump buttons would
 * disagree about the same file.
 */
function recordIsComplete(state: AppStore): (index: number) => boolean {
  const { config, records, labels, prefill } = state;
  return (index) => {
    const record = records[index];
    if (!config || !record) return true;
    const values = labels[record.index] ?? record.labelValues;
    const merged = resolveLabelValues(values, prefill, config.output.fields);
    return evaluateRecord(merged, config.output.fields).status === "complete";
  };
}

export function selectCompletedCount(state: AppStore): number {
  if (!state.config) return 0;
  const isComplete = recordIsComplete(state);
  let n = 0;
  for (let i = 0; i < state.records.length; i++) {
    if (isComplete(i)) n += 1;
  }
  return n;
}

/**
 * Whether the jump-to-unfinished controls have anywhere to go.
 *
 * Booleans rather than one object on purpose: zustand compares selector results
 * with `Object.is`, so returning a fresh `{ before, after }` every render would
 * re-render forever.
 */
export const selectHasIncompleteAfter = (state: AppStore): boolean =>
  state.config !== null &&
  findIncomplete(state.index, 1, state.records.length, recordIsComplete(state)) !== null;

export const selectHasIncompleteBefore = (state: AppStore): boolean =>
  state.config !== null &&
  findIncomplete(state.index, -1, state.records.length, recordIsComplete(state)) !== null;

export const selectCurrentRecord = (state: AppStore): RecordView | undefined =>
  state.records[state.index];

// --- Tell main where the labeler is, so analysis can work ahead of them. ---
// Separate from the autosave subscriber below because it is not phase-gated:
// the panel is on screen during labeling, and the queue should be warming up
// before anyone has answered anything.
useStore.subscribe((state, prev) => {
  if (state.index === prev.index && state.records === prev.records) return;
  if (!state.settings.aiEnabled) return;
  void window.api.setAiIndex(state.index);
});

// --- Autosave: write-through on every labeling-relevant state change. ---
// Using the two-arg subscriber so we can bail out when only unrelated state
// (e.g. updateStatus, themeMode) changes — avoiding unnecessary IPC traffic.
/** Phases where a session is live and worth persisting. */
const LABELING_PHASES = new Set<Phase>(["need-prefill", "labeling"]);

useStore.subscribe((state, prev) => {
  // Guard on an active labeling phase before issuing saveSession. submitDone() sets
  // phase: "done" synchronously before calling clearSession(); the export
  // round-trip drains in-flight saves before clearSession reaches the main
  // queue, making a saveSession/clearSession reorder practically impossible.
  if (!LABELING_PHASES.has(state.phase) || !state.configPath || !state.inputPath) return;
  // Only IPC when something meaningful to the session actually changed.
  if (
    state.labels === prev.labels &&
    state.prefill === prev.prefill &&
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
    prefill: state.prefill,
  });
});

// --- Menu-context sync: keep the native menu in sync with config/mode state. ---
// Single subscriber instead of imperative calls scattered across actions.
// Fires only when config-nullness or mode actually changes to avoid redundant IPC.
useStore.subscribe((state, prev) => {
  const configLoaded = state.config !== null;
  const prevConfigLoaded = prev.config !== null;
  if (configLoaded === prevConfigLoaded && state.mode === prev.mode) return;
  void window.api.setMenuContext({ configLoaded, mode: state.mode });
});
