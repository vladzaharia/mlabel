import type {
  ConfigLoadResponse,
  ExportRequest,
  ExportResponse,
  InputLoadResponse,
  RecentPaths,
  SessionData,
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

export interface IpcApi {
  /** Liveness check used by the renderer on boot. */
  ping: () => Promise<"pong">;

  // --- Theme ---
  getTheme: () => Promise<boolean>;
  onThemeChange: (listener: ThemeListener) => () => void;

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

  // --- Session (autosave / resume) ---
  saveSession: (data: SessionData) => Promise<void>;
  clearSession: () => Promise<void>;

  // --- Export ---
  exportLabels: (request: ExportRequest) => Promise<ExportResponse>;

  // --- Recents ---
  getRecent: () => Promise<RecentPaths>;
}

/** Channel names for `invoke`/`handle` request-response methods. */
export const IPC_INVOKE = {
  ping: "app:ping",
  getTheme: "theme:get",
  getStartupConfig: "config:startup",
  pickConfig: "config:pick",
  pickInput: "input:pick",
  loadInput: "input:load",
  saveSession: "session:save",
  clearSession: "session:clear",
  exportLabels: "export:run",
  getRecent: "recent:get",
} as const;

/** Channel names for main -> renderer push events. */
export const IPC_EVENT = {
  themeChanged: "theme:changed",
} as const;
