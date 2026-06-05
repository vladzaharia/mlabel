/**
 * Single source of truth for the renderer <-> main IPC surface.
 *
 * - The preload implements `IpcApi` (via `satisfies IpcApi`) and exposes it as
 *   `window.api`.
 * - The main process registers a handler per method through a typed `handle()`
 *   wrapper.
 * - The renderer consumes `window.api: IpcApi`.
 *
 * Renaming or retyping a method here fails the build in all three layers.
 *
 * This contract is intentionally minimal in Phase 0 and grows as services land
 * (config loading, parsing, export, session) in later phases.
 */

export type ThemeListener = (isDark: boolean) => void;

export interface IpcApi {
  /** Liveness check used by the renderer on boot. */
  ping: () => Promise<"pong">;
  /** Current OS dark-mode state, resolved from `nativeTheme`. */
  getTheme: () => Promise<boolean>;
  /** Subscribe to OS theme changes; returns an unsubscribe function. */
  onThemeChange: (listener: ThemeListener) => () => void;
}

/** Channel names for `invoke`/`handle` request-response methods. */
export const IPC_INVOKE = {
  ping: "app:ping",
  getTheme: "theme:get",
} as const;

/** Channel names for main -> renderer push events. */
export const IPC_EVENT = {
  themeChanged: "theme:changed",
} as const;
