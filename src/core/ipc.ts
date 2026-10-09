import type { Analysis, EngineState } from "./ai/types";
import type {
  AppInfo,
  AppSettings,
  ConfigLoadResponse,
  ExportRequest,
  ExportResponse,
  InputLoadResponse,
  JoinAnalyzeResponse,
  JoinKind,
  JoinRequest,
  JoinRunResponse,
  NetworkLogEntry,
  ModelCallEntry,
  PrepareFilePickResponse,
  RecentPaths,
  SessionData,
  SplitAnalyzeResponse,
  SplitRequest,
  SplitRunResponse,
  UpdateStatus,
} from "./types/view";

/**
 * Single source of truth for the renderer <-> main IPC surface.
 *
 * - The preload implements `IpcApi` (via `satisfies IpcApi`) and exposes it as
 *   `window.api`.
 * - The main process registers a handler per method through `ipcMain.handle`.
 * - The renderer consumes `window.api: IpcApi`.
 *
 * Renaming or retyping a method here fails the build in all three layers.
 */

export type ThemeListener = (isDark: boolean) => void;
export type UpdateStatusListener = (status: UpdateStatus) => void;
export type SetModeListener = (mode: "label" | "prepare") => void;
export type OpenSettingsListener = () => void;
export type AiStatusListener = (state: EngineState) => void;
export type AiAnalysisListener = (analysis: Analysis) => void;
export type ModelCallListener = (entry: ModelCallEntry) => void;
export type NetworkLogListener = (entry: NetworkLogEntry) => void;

export interface IpcApi {
  /** Liveness check used by the renderer on boot. */
  ping: () => Promise<"pong">;

  // --- Theme ---
  getTheme: () => Promise<boolean>;
  onThemeChange: (listener: ThemeListener) => () => void;

  // --- Auto-update ---
  /** Subscribe to update-status pushes from the main-process updater. */
  onUpdateStatus: (listener: UpdateStatusListener) => () => void;
  /** Subscribe to mode-switch commands pushed from the native application menu. */
  onSetMode: (listener: SetModeListener) => () => void;
  /** Notify main of the renderer's current menu context (so menu stays in sync). */
  setMenuContext: (ctx: { configLoaded: boolean; mode: "label" | "prepare" }) => Promise<void>;
  /** Quit and install a downloaded update (installable builds only). */
  installUpdate: () => Promise<void>;
  /** Open a URL in the user's default browser (e.g. a portable release asset). */
  openExternal: (url: string) => Promise<void>;
  /**
   * Manually trigger an update check from the renderer (e.g. error-state retry).
   * No-op if updates were never armed (zero-network invariant preserved).
   */
  checkForUpdates: () => Promise<void>;

  // --- File reveal ---
  /**
   * Reveal a file in the OS file manager. Only paths that main itself produced
   * (export output / remaining, prepare split / join outputs) are allowed;
   * all others reject with an Error to prevent path-traversal misuse.
   */
  revealPath: (path: string) => Promise<void>;

  // --- Config ---
  /** Auto-discover a config adjacent to the executable (or recent), if any. */
  getStartupConfig: () => Promise<ConfigLoadResponse>;
  /** Prompt for and load a config file via the native picker. */
  pickConfig: () => Promise<ConfigLoadResponse>;

  // --- Input ---
  /** Prompt for and load an input file against the current config. */
  pickInput: () => Promise<InputLoadResponse>;
  /** Load a specific input path (drag-drop / recent). */
  loadInput: (path: string) => Promise<InputLoadResponse>;
  /** Resolve a dropped File to an absolute path (preload uses webUtils). */
  pathForFile: (file: File) => string;
  /**
   * Drop the parsed input document held in main.
   *
   * The renderer leaving a file is the only signal main gets. Without it the
   * document stays resident for the process lifetime, and a later export would
   * write the old file's rows.
   */
  unloadInput: () => Promise<void>;
  /** Drop the loaded config (and, with it, the input that depended on it). */
  unloadConfig: () => Promise<void>;

  // --- Session (autosave / resume) ---
  saveSession: (data: SessionData) => Promise<void>;
  clearSession: () => Promise<void>;
  /** The persisted session exactly as it sits on disk, for the settings pane. */
  getSessionInfo: () => Promise<SessionData | null>;

  // --- Settings ---
  /** Static facts about this build: version, platform, update arming. */
  getAppInfo: () => Promise<AppInfo>;
  getSettings: () => Promise<AppSettings>;
  /**
   * Merge a patch and persist it, applying any side effects. Returns what is
   * now in force, so the renderer mirrors disk without a second round trip.
   */
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  resetSettings: () => Promise<AppSettings>;
  /** Subscribe to "open Settings" commands pushed from the native menu. */
  onOpenSettings: (listener: OpenSettingsListener) => () => void;

  // --- On-device anomaly detection ---
  /** What the engine can do right now, plus which models are on disk. */
  getAiStatus: () => Promise<{ state: EngineState; downloaded: string[]; cached: Analysis[] }>;
  /** Begin fetching a model. Progress arrives via `onAiStatus`. */
  downloadModel: (modelId: string) => Promise<void>;
  cancelModelDownload: () => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  /** Where the labeler is, so analysis can work ahead of them. */
  setAiIndex: (index: number) => Promise<void>;
  onAiStatus: (listener: AiStatusListener) => () => void;
  onAiAnalysis: (listener: AiAnalysisListener) => () => void;
  /**
   * Every run of the model this session, oldest first, prompts included.
   *
   * The counterpart to `getNetworkLog`: a labeler told to verify the results
   * needs to see what was asked, not only what came back.
   */
  getModelLog: () => Promise<ModelCallEntry[]>;
  onModelCall: (listener: ModelCallListener) => () => void;

  // --- Network ---
  /** Every call recorded this session, oldest first. */
  getNetworkLog: () => Promise<NetworkLogEntry[]>;
  onNetworkLog: (listener: NetworkLogListener) => () => void;

  // --- Export ---
  exportLabels: (request: ExportRequest) => Promise<ExportResponse>;

  // --- Recents ---
  getRecent: () => Promise<RecentPaths>;

  // --- Prepare (split / join; stateless in main — files re-read on run) ---
  /** Pick one input file and validate it against the input schema. */
  pickSplitFile: () => Promise<SplitAnalyzeResponse>;
  /** Analyze a specific input path (drag-drop). */
  analyzeSplitFile: (path: string) => Promise<SplitAnalyzeResponse>;
  /** Pick any prepare files (mode-agnostic); analysis happens via the analyze methods. */
  pickPrepareFiles: () => Promise<PrepareFilePickResponse>;
  /** Split the file into N contiguous parts next to the source. */
  runSplit: (request: SplitRequest) => Promise<SplitRunResponse>;
  /** Pick one or more files of the given kind and analyze them for a join. */
  pickJoinFiles: (kind: JoinKind) => Promise<JoinAnalyzeResponse>;
  /** (Re-)analyze the full current file list for a join. */
  analyzeJoinFiles: (request: JoinRequest) => Promise<JoinAnalyzeResponse>;
  /** Join the files into one, saved where the user chooses. */
  runJoin: (request: JoinRequest) => Promise<JoinRunResponse>;
}

/** Channel names for `invoke`/`handle` request-response methods. */
export const IPC_INVOKE = {
  ping: "app:ping",
  getTheme: "theme:get",
  getStartupConfig: "config:startup",
  pickConfig: "config:pick",
  pickInput: "input:pick",
  loadInput: "input:load",
  unloadInput: "input:unload",
  unloadConfig: "config:unload",
  saveSession: "session:save",
  clearSession: "session:clear",
  getSessionInfo: "session:info",
  getAppInfo: "app:info",
  getSettings: "settings:get",
  setSettings: "settings:set",
  resetSettings: "settings:reset",
  getNetworkLog: "network:log",
  getAiStatus: "ai:status",
  downloadModel: "ai:download",
  cancelModelDownload: "ai:download-cancel",
  deleteModel: "ai:delete",
  setAiIndex: "ai:index",
  getModelLog: "ai:model-log",
  exportLabels: "export:run",
  getRecent: "recent:get",
  installUpdate: "update:install",
  checkForUpdates: "update:check",
  openExternal: "shell:open-external",
  revealPath: "shell:reveal-path",
  pickSplitFile: "prepare:split-pick",
  pickPrepareFiles: "prepare:files-pick",
  analyzeSplitFile: "prepare:split-analyze",
  runSplit: "prepare:split-run",
  pickJoinFiles: "prepare:join-pick",
  analyzeJoinFiles: "prepare:join-analyze",
  runJoin: "prepare:join-run",
  setMenuContext: "menu:context",
} as const;

/** Channel names for main -> renderer push events. */
export const IPC_EVENT = {
  themeChanged: "theme:changed",
  updateStatus: "update:status",
  setMode: "menu:set-mode",
  openSettings: "menu:open-settings",
  networkLog: "network:log-entry",
  aiStatus: "ai:status-changed",
  aiAnalysis: "ai:analysis",
  modelCall: "ai:model-call",
} as const;
