import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@core/config";
import type { AppConfig, IpcApi, RecordView } from "@core";
import type { LabelMap } from "@core";
import {
  COLOR_THEMES,
  resolveDark,
  selectCompletedCount,
  useStore,
  type AppStore,
  type ColorTheme,
} from "./store";
import { useAnnouncer } from "../a11y/announcer";

const config = loadAppConfig();

function loadAppConfig(): AppConfig {
  const result = loadConfig(`{
    "input": {
      "fields": [{ "name": "id", "type": { "type": "text" } }],
      "categories": [{ "id": "c", "displayName": "C", "rows": [{ "fields": ["id"] }] }]
    },
    "output": {
      "fields": [
        { "name": "id", "control": "hidden" },
        { "name": "verdict", "control": "radio", "options": [{ "value": "good" }, { "value": "bad" }] }
      ]
    }
  }`);
  if (!result.ok) throw new Error("invalid test config");
  return result.config;
}

const records: RecordView[] = [
  {
    index: 0,
    inputValues: { id: "1" },
    labelValues: { id: "1", verdict: null },
    coercionErrors: [],
  },
  {
    index: 1,
    inputValues: { id: "2" },
    labelValues: { id: "2", verdict: null },
    coercionErrors: [],
  },
];

function seed(partial: Partial<AppStore>): void {
  // Mirror the real load flow: labels are pre-seeded from each record's
  // (auto-copied) label values.
  const labels: Record<number, LabelMap> = {};
  for (const record of records) labels[record.index] = { ...record.labelValues };
  useStore.setState({ config, records, index: 0, labels, phase: "labeling", ...partial });
}

describe("store: theme resolution", () => {
  it("resolves dark from mode + system", () => {
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
  });
});

describe("store: navigation", () => {
  beforeEach(() => seed({}));

  it("clamps next/prev within bounds", () => {
    const { next, prev } = useStore.getState();
    prev();
    expect(useStore.getState().index).toBe(0);
    next();
    expect(useStore.getState().index).toBe(1);
    next();
    expect(useStore.getState().index).toBe(1);
  });
});

describe("store: completion count", () => {
  beforeEach(() => seed({}));

  it("counts records whose required fields are valid", () => {
    expect(selectCompletedCount(useStore.getState())).toBe(0);
    useStore.getState().setLabel(0, "verdict", "good");
    expect(selectCompletedCount(useStore.getState())).toBe(1);
    useStore.getState().setLabel(1, "verdict", "bad");
    expect(selectCompletedCount(useStore.getState())).toBe(2);
  });
});

describe("store: color theme", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    useStore.setState({ colorTheme: "cobalt" });
  });
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("lists the four named themes with cobalt first", () => {
    expect(COLOR_THEMES.map((t) => t.id)).toEqual(["cobalt", "parchment", "fjord", "vespers"]);
  });

  it("setColorTheme updates state, persists, and sets the data-theme attribute", () => {
    for (const theme of COLOR_THEMES.map((t) => t.id) as ColorTheme[]) {
      useStore.getState().setColorTheme(theme);
      expect(useStore.getState().colorTheme).toBe(theme);
      expect(localStorage.getItem("mlabel.colortheme")).toBe(theme);
      expect(document.documentElement.dataset.theme).toBe(theme);
    }
  });
});

// ---------------------------------------------------------------------------
// Write-through autosave tests
// ---------------------------------------------------------------------------
describe("store: write-through autosave", () => {
  const saveSessionMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const clearSessionMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const setMenuContextMockAutosave = vi.fn<IpcApi["setMenuContext"]>().mockResolvedValue(undefined);

  beforeEach(() => {
    saveSessionMock.mockClear();
    clearSessionMock.mockClear();
    setMenuContextMockAutosave.mockClear();
    // Must use Object.defineProperty (same as app.test.tsx) so that
    // `window.api` resolves correctly in happy-dom.
    Object.defineProperty(window, "api", {
      value: {
        saveSession: saveSessionMock,
        clearSession: clearSessionMock,
        setMenuContext: setMenuContextMockAutosave,
      },
      configurable: true,
      writable: true,
    });
    // Seed with non-null configPath/inputPath so the autosave guard passes.
    seed({ configPath: "/cfg/test.jsonc", inputPath: "/data/input.csv" });
    saveSessionMock.mockClear(); // ignore the subscriber call from setState in seed()
  });

  afterEach(() => {
    // Reset store to non-labeling phase to stop autosave emissions.
    useStore.setState({ phase: "boot" });
  });

  it("calls saveSession once per setLabel during labeling", () => {
    useStore.getState().setLabel(0, "verdict", "good");
    expect(saveSessionMock).toHaveBeenCalledOnce();
    expect(saveSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "/cfg/test.jsonc",
        inputPath: "/data/input.csv",
        index: 0,
      }),
    );
  });

  it("does not call saveSession when phase is not labeling", () => {
    useStore.setState({ phase: "done" });
    saveSessionMock.mockClear();
    useStore.getState().setLabel(0, "verdict", "good");
    expect(saveSessionMock).not.toHaveBeenCalled();
  });

  it("does not call saveSession when only unrelated state (updateStatus) changes during labeling", () => {
    saveSessionMock.mockClear();
    // Trigger a state change that only touches updateStatus — not labels/index/paths.
    useStore.setState({ updateStatus: { kind: "checking" } });
    expect(saveSessionMock).not.toHaveBeenCalled();
  });

  it("calls saveSession with correct payload when index advances", () => {
    useStore.getState().next();
    expect(saveSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        configPath: "/cfg/test.jsonc",
        inputPath: "/data/input.csv",
        index: 1,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Zero-records guard
// ---------------------------------------------------------------------------
describe("store: zero-records guard", () => {
  const loadInputMock = vi.fn<IpcApi["loadInput"]>();
  const clearSessionMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const saveSessionMock2 = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const setMenuContextMockZero = vi.fn<IpcApi["setMenuContext"]>().mockResolvedValue(undefined);

  beforeEach(() => {
    loadInputMock.mockClear();
    clearSessionMock.mockClear();
    saveSessionMock2.mockClear();
    setMenuContextMockZero.mockClear();
    Object.defineProperty(window, "api", {
      value: {
        loadInput: loadInputMock,
        clearSession: clearSessionMock,
        saveSession: saveSessionMock2,
        setMenuContext: setMenuContextMockZero,
      },
      configurable: true,
      writable: true,
    });
    useStore.setState({ phase: "need-input", config, records: [], error: null, busy: false });
  });

  afterEach(() => {
    useStore.setState({ phase: "boot" });
  });

  it("routes to input-invalid with a clear message when records is empty", async () => {
    loadInputMock.mockResolvedValue({
      ok: true,
      canceled: false,
      path: "/data/empty.csv",
      records: [],
      headerIssues: [],
    });

    await useStore.getState().loadInputPath("/data/empty.csv");

    const state = useStore.getState();
    expect(state.phase).toBe("input-invalid");
    expect(state.error).toBe("This file has no data rows to label.");
    expect(state.records).toHaveLength(0);
  });

  it("proceeds to labeling when records is non-empty", async () => {
    loadInputMock.mockResolvedValue({
      ok: true,
      canceled: false,
      path: "/data/rows.csv",
      records,
      headerIssues: [],
    });

    await useStore.getState().loadInputPath("/data/rows.csv");

    expect(useStore.getState().phase).toBe("labeling");
  });
});

// ---------------------------------------------------------------------------
// exportError lifecycle + submitDone announcements
// ---------------------------------------------------------------------------
describe("store: exportError and submitDone announcements", () => {
  const exportLabelsMock = vi.fn<IpcApi["exportLabels"]>();
  const clearSessionMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const saveSessionMock3 = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const setMenuContextMockExport = vi.fn<IpcApi["setMenuContext"]>().mockResolvedValue(undefined);

  beforeEach(() => {
    exportLabelsMock.mockClear();
    clearSessionMock.mockClear();
    saveSessionMock3.mockClear();
    setMenuContextMockExport.mockClear();
    Object.defineProperty(window, "api", {
      value: {
        exportLabels: exportLabelsMock,
        clearSession: clearSessionMock,
        saveSession: saveSessionMock3,
        setMenuContext: setMenuContextMockExport,
      },
      configurable: true,
      writable: true,
    });
    useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });
    seed({ configPath: "/cfg/test.jsonc", inputPath: "/data/input.csv" });
  });

  afterEach(() => {
    useStore.setState({ phase: "boot", exportError: null });
  });

  it("clears exportError at the start of an export attempt", async () => {
    exportLabelsMock.mockResolvedValue({ ok: true, completeCount: 1 });
    useStore.setState({ exportError: "previous error" });

    await useStore.getState().submitDone();

    // exportError was cleared (set to null) before the await resolved
    expect(useStore.getState().exportError).toBeNull();
  });

  it("sets exportError on failure and stays in labeling phase", async () => {
    exportLabelsMock.mockResolvedValue({ ok: false, error: "Disk full" });

    await useStore.getState().submitDone();

    const state = useStore.getState();
    expect(state.exportError).toBe("Disk full");
    expect(state.phase).toBe("labeling");
  });

  it("announces assertively on export failure", async () => {
    exportLabelsMock.mockResolvedValue({ ok: false, error: "Disk full" });

    await useStore.getState().submitDone();

    expect(useAnnouncer.getState().assertive.message).toBe("Export failed: Disk full");
  });

  it("announces assertively on export success", async () => {
    exportLabelsMock.mockResolvedValue({ ok: true, completeCount: 2 });

    await useStore.getState().submitDone();

    expect(useAnnouncer.getState().assertive.message).toBe("Export complete, 2 records exported");
  });

  it("announces singular for a single record export", async () => {
    exportLabelsMock.mockResolvedValue({ ok: true, completeCount: 1 });

    await useStore.getState().submitDone();

    expect(useAnnouncer.getState().assertive.message).toBe("Export complete, 1 record exported");
  });

  it("clearExportError sets exportError to null", () => {
    useStore.setState({ exportError: "some error" });
    useStore.getState().clearExportError();
    expect(useStore.getState().exportError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pendingResumeStale — applyInputResponse propagation + reset sites
// ---------------------------------------------------------------------------
describe("store: pendingResumeStale", () => {
  const loadInputMock = vi.fn<IpcApi["loadInput"]>();
  const clearSessionMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const saveSessionMockStale = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  const staleResume = {
    configPath: "/cfg.jsonc",
    inputPath: "/in.csv",
    index: 1,
    labels: { 0: { verdict: "good" } },
  };
  const staleRecords: RecordView[] = [
    { index: 0, inputValues: { id: "1" }, labelValues: { id: "1" }, coercionErrors: [] },
  ];

  beforeEach(() => {
    loadInputMock.mockClear();
    clearSessionMock.mockClear();
    saveSessionMockStale.mockClear();
    Object.defineProperty(window, "api", {
      value: {
        loadInput: loadInputMock,
        clearSession: clearSessionMock,
        saveSession: saveSessionMockStale,
        setMenuContext: async () => {},
      },
      configurable: true,
      writable: true,
    });
    useStore.setState({
      phase: "need-input",
      config,
      records: [],
      error: null,
      busy: false,
      pendingResume: null,
      pendingResumeStale: false,
    });
  });

  afterEach(() => {
    useStore.setState({ phase: "boot" });
  });

  it("applyInputResponse sets pendingResumeStale=true when response has resumeStale:true", async () => {
    loadInputMock.mockResolvedValue({
      ok: true,
      path: "/in.csv",
      records: staleRecords,
      headerIssues: [],
      resume: staleResume,
      resumeStale: true,
    });

    await useStore.getState().loadInputPath("/in.csv");

    expect(useStore.getState().pendingResumeStale).toBe(true);
    expect(useStore.getState().pendingResume).toEqual(staleResume);
  });

  it("applyInputResponse sets pendingResumeStale=false when response has resumeStale:false", async () => {
    loadInputMock.mockResolvedValue({
      ok: true,
      path: "/in.csv",
      records: staleRecords,
      headerIssues: [],
      resume: staleResume,
      resumeStale: false,
    });

    await useStore.getState().loadInputPath("/in.csv");

    expect(useStore.getState().pendingResumeStale).toBe(false);
  });

  it("applyResume resets pendingResumeStale", () => {
    useStore.setState({
      pendingResume: staleResume,
      pendingResumeStale: true,
      records: staleRecords,
    });
    useStore.getState().applyResume();
    expect(useStore.getState().pendingResumeStale).toBe(false);
    expect(useStore.getState().pendingResume).toBeNull();
  });

  it("dismissResume resets pendingResumeStale", () => {
    useStore.setState({ pendingResume: staleResume, pendingResumeStale: true });
    useStore.getState().dismissResume();
    expect(useStore.getState().pendingResumeStale).toBe(false);
    expect(useStore.getState().pendingResume).toBeNull();
  });

  it("deferResume resets pendingResumeStale", () => {
    useStore.setState({ pendingResume: staleResume, pendingResumeStale: true });
    useStore.getState().deferResume();
    expect(useStore.getState().pendingResumeStale).toBe(false);
    expect(useStore.getState().pendingResume).toBeNull();
  });

  it("backToInput resets pendingResumeStale", () => {
    useStore.setState({ pendingResume: staleResume, pendingResumeStale: true, phase: "labeling" });
    useStore.getState().backToInput();
    expect(useStore.getState().pendingResumeStale).toBe(false);
  });

  it("backToConfig resets pendingResumeStale", () => {
    useStore.setState({ pendingResume: staleResume, pendingResumeStale: true, phase: "labeling" });
    useStore.getState().backToConfig();
    expect(useStore.getState().pendingResumeStale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deferResume — Esc/overlay-close semantics
// ---------------------------------------------------------------------------
describe("store: deferResume", () => {
  const clearSessionMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  beforeEach(() => {
    clearSessionMock.mockClear();
    Object.defineProperty(window, "api", {
      value: { clearSession: clearSessionMock },
      configurable: true,
      writable: true,
    });
    useStore.setState({
      pendingResume: {
        configPath: "/cfg.jsonc",
        inputPath: "/in.csv",
        index: 1,
        labels: { 0: { verdict: "good" } },
      },
    });
  });

  it("clears pendingResume without calling clearSession", () => {
    useStore.getState().deferResume();
    expect(useStore.getState().pendingResume).toBeNull();
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it("dismissResume (Start fresh) DOES call clearSession", () => {
    useStore.getState().dismissResume();
    expect(useStore.getState().pendingResume).toBeNull();
    expect(clearSessionMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// setMode — menu-driven mode switching
// ---------------------------------------------------------------------------
describe("store: setMode", () => {
  const setMenuContextMock = vi.fn<IpcApi["setMenuContext"]>().mockResolvedValue(undefined);

  beforeEach(() => {
    setMenuContextMock.mockClear();
    useAnnouncer.setState({ polite: { message: "", seq: 0 }, assertive: { message: "", seq: 0 } });
    Object.defineProperty(window, "api", {
      value: { setMenuContext: setMenuContextMock },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    useStore.setState({ phase: "boot", config: null, records: [], mode: "label" });
  });

  it("is a no-op when no config is loaded", () => {
    useStore.setState({ phase: "need-config", config: null, records: [] });
    useStore.getState().setMode("prepare");
    expect(useStore.getState().phase).toBe("need-config");
    expect(setMenuContextMock).not.toHaveBeenCalled();
  });

  it("setMode('prepare') transitions to 'prepare' phase when config is loaded", () => {
    useStore.setState({ phase: "need-input", config, records: [] });
    setMenuContextMock.mockClear(); // clear the call from config-load subscriber
    useStore.getState().setMode("prepare");
    expect(useStore.getState().phase).toBe("prepare");
    expect(useStore.getState().mode).toBe("prepare");
    expect(setMenuContextMock).toHaveBeenCalledWith({ configLoaded: true, mode: "prepare" });
  });

  it("setMode('label') transitions to 'need-input' when no records loaded", () => {
    useStore.setState({ phase: "prepare", config, records: [], mode: "prepare" });
    setMenuContextMock.mockClear(); // clear the call from config-load subscriber
    useStore.getState().setMode("label");
    expect(useStore.getState().phase).toBe("need-input");
    expect(useStore.getState().mode).toBe("label");
    expect(setMenuContextMock).toHaveBeenCalledWith({ configLoaded: true, mode: "label" });
  });

  it("setMode('label') transitions to 'labeling' when records are loaded", () => {
    useStore.setState({
      phase: "prepare",
      config,
      records: [{ index: 0, inputValues: {}, labelValues: {}, coercionErrors: [] }],
      mode: "prepare",
    });
    setMenuContextMock.mockClear(); // clear the call from config-load subscriber
    useStore.getState().setMode("label");
    expect(useStore.getState().phase).toBe("labeling");
    expect(useStore.getState().mode).toBe("label");
    expect(setMenuContextMock).toHaveBeenCalledWith({ configLoaded: true, mode: "label" });
  });

  it("setMode('prepare') announces 'Prepare mode'", () => {
    useStore.setState({ phase: "need-input", config, records: [] });
    useStore.getState().setMode("prepare");
    expect(useAnnouncer.getState().polite.message).toBe("Prepare mode");
  });

  it("setMode('label') announces 'Labeling mode'", () => {
    useStore.setState({ phase: "prepare", config, records: [], mode: "prepare" });
    useStore.getState().setMode("label");
    expect(useAnnouncer.getState().polite.message).toBe("Labeling mode");
  });

  // M1 — preservation: labels and index survive a prepare→label→prepare cycle
  it("labels and index are unchanged across a prepare→label→prepare cycle", () => {
    const frozenLabels: Record<number, LabelMap> = {
      0: { verdict: "good" },
      1: { verdict: "bad" },
    };
    useStore.setState({
      phase: "labeling",
      config,
      records,
      labels: frozenLabels,
      index: 1,
      mode: "label",
    });
    setMenuContextMock.mockClear();

    useStore.getState().setMode("prepare");
    expect(useStore.getState().labels).toEqual(frozenLabels);
    expect(useStore.getState().index).toBe(1);

    useStore.getState().setMode("label");
    expect(useStore.getState().labels).toEqual(frozenLabels);
    expect(useStore.getState().index).toBe(1);

    useStore.getState().setMode("prepare");
    expect(useStore.getState().labels).toEqual(frozenLabels);
    expect(useStore.getState().index).toBe(1);
  });

  // I2/I3 — subscriber-driven menu-context sync
  it("config load triggers setMenuContext with configLoaded:true via subscriber", () => {
    // Start with no config (config: null from afterEach + boot).
    useStore.setState({ phase: "need-config", config: null, records: [], mode: "label" });
    setMenuContextMock.mockClear();

    // Simulate a config becoming available.
    useStore.setState({ config, phase: "need-input" });

    expect(setMenuContextMock).toHaveBeenCalledWith({ configLoaded: true, mode: "label" });
  });

  it("backToConfig triggers setMenuContext with configLoaded:false via subscriber", () => {
    useStore.setState({ phase: "need-input", config, records: [], mode: "label" });
    setMenuContextMock.mockClear();

    useStore.getState().backToConfig();

    expect(setMenuContextMock).toHaveBeenCalledWith({ configLoaded: false, mode: "label" });
  });
});
