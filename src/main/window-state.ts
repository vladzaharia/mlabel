/**
 * Window state persistence — size/position/maximized across launches.
 *
 * Two layers:
 *  1. Pure logic (`sanitizeWindowState`) — Electron-free, fully testable in Node.
 *  2. Electron glue (`loadWindowState`, `trackWindowState`, `flushWindowState`).
 */

import { join } from "node:path";
import { app, screen, type BrowserWindow } from "electron";
import { readJsonSafe, writeJsonAtomic } from "./services/atomic-write";
import { createWriteQueue } from "./services/write-queue";

// ---------------------------------------------------------------------------
// Shared types (exported for tests)
// ---------------------------------------------------------------------------

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Pure logic
// ---------------------------------------------------------------------------

/**
 * Height of the title/drag bar strip we require to remain accessible.
 * Matches the titleBarOverlay height used throughout the app.
 */
const TITLE_STRIP_H = 44;

/**
 * Minimum intersection dimensions required for the title strip to count as
 * accessible so the user can drag/move the window.
 */
const THRESH_W = 100;
/**
 * Must match TITLE_STRIP_H so the full draggable strip height remains visible.
 */
const THRESH_H = TITLE_STRIP_H;

/** True for a finite positive number — valid for width/height dimensions. */
const isValidDim = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/** True for any finite number — valid for x/y coordinates (including zero). */
const isValidCoord = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v);

/**
 * Validate and normalise a raw (potentially untrusted) saved window state.
 *
 * Rules:
 *  - Non-conforming JSON (wrong shape/types/NaN/negative) → use defaults, no position.
 *  - Clamp width/height to [min, largest-display-workArea-dim].
 *  - Keep x/y ONLY if the title-bar strip (top 44 px, full window width) intersects
 *    some display workArea by ≥ 100 × 44 px — else drop (Electron centres).
 *  - maximized is a strict boolean passthrough; anything else becomes false.
 */
export function sanitizeWindowState(
  saved: unknown,
  displays: DisplayRect[],
  defaults: { width: number; height: number },
  min: { width: number; height: number },
): WindowState {
  // Compute clamp ceiling once — used for both the defaults path and the
  // normal path. When there are no displays, fall back to the defaults
  // themselves so the ceiling is always ≥ the floor.
  const maxW = displays.length > 0 ? Math.max(...displays.map((d) => d.width)) : defaults.width;
  const maxH = displays.length > 0 ? Math.max(...displays.map((d) => d.height)) : defaults.height;

  // ── 1. Parse raw fields ──────────────────────────────────────────────────
  if (saved === null || typeof saved !== "object" || Array.isArray(saved)) {
    return {
      width: Math.min(Math.max(defaults.width, min.width), maxW),
      height: Math.min(Math.max(defaults.height, min.height), maxH),
      maximized: false,
    };
  }

  const raw = saved as Record<string, unknown>;
  const rawW = raw["width"];
  const rawH = raw["height"];

  if (!isValidDim(rawW) || !isValidDim(rawH)) {
    return {
      width: Math.min(Math.max(defaults.width, min.width), maxW),
      height: Math.min(Math.max(defaults.height, min.height), maxH),
      maximized: false,
    };
  }

  // ── 2. Clamp size to [min, largest-display] ──────────────────────────────
  const width = Math.min(Math.max(rawW, min.width), maxW);
  const height = Math.min(Math.max(rawH, min.height), maxH);

  // ── 3. Maximized passthrough ─────────────────────────────────────────────
  const maximized = raw["maximized"] === true;

  // ── 4. Validate position ─────────────────────────────────────────────────
  const rawX = raw["x"];
  const rawY = raw["y"];

  if (displays.length === 0 || !isValidCoord(rawX) || !isValidCoord(rawY)) {
    return { width, height, maximized };
  }

  const x = rawX;
  const y = rawY;

  // Title-strip rectangle: top 44 px of the window, full window width
  const stripLeft = x;
  const stripRight = x + width;
  const stripTop = y;
  const stripBottom = y + TITLE_STRIP_H;

  const accessible = displays.some((d) => {
    const ix = Math.min(stripRight, d.x + d.width) - Math.max(stripLeft, d.x);
    const iy = Math.min(stripBottom, d.y + d.height) - Math.max(stripTop, d.y);
    return ix >= THRESH_W && iy >= THRESH_H;
  });

  if (!accessible) {
    return { width, height, maximized };
  }

  return { width, height, x, y, maximized };
}

// ---------------------------------------------------------------------------
// Electron glue
// ---------------------------------------------------------------------------

const STATE_FILENAME = "window-state.json";
const WIN_DEFAULTS = { width: 1100, height: 800 };
const WIN_MIN = { width: 720, height: 560 };

/** Trailing timer handle for resize/move coalescing. */
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

/** Current window reference, cached for flush-time capture. */
let cachedWin: BrowserWindow | undefined;

/** Module-level write queue for window-state persistence. */
const windowStateQueue = createWriteQueue<WindowState>(async (state) => {
  const path = join(app.getPath("userData"), STATE_FILENAME);
  await writeJsonAtomic(path, state, { fsync: false });
});

/**
 * Read and sanitise the persisted window state.
 * MUST be called after `app.whenReady()` (screen API requires it).
 */
export async function loadWindowState(): Promise<WindowState> {
  const path = join(app.getPath("userData"), STATE_FILENAME);
  const saved = await readJsonSafe<unknown>(path);
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  return sanitizeWindowState(saved, displays, WIN_DEFAULTS, WIN_MIN);
}

/**
 * Attach resize/move/maximize listeners to `win` so the window state is
 * continuously persisted via the write queue.
 *
 * - resize/move: coalesced to 500 ms trailing timer (avoids 60 Hz queue churn)
 * - maximize/unmaximize: immediate push
 * - close: synchronous push using `getNormalBounds()` so the un-maximized rect
 *   is saved alongside `maximized: true`
 */
export function trackWindowState(win: BrowserWindow): void {
  cachedWin = win;

  function captureState(): WindowState {
    const b = win.getNormalBounds();
    return { ...b, maximized: win.isMaximized() };
  }

  function scheduleWrite(): void {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      windowStateQueue.push(captureState());
    }, 500);
  }

  function pushNow(): void {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    windowStateQueue.push(captureState());
  }

  win.on("resize", scheduleWrite);
  win.on("move", scheduleWrite);
  win.on("maximize", pushNow);
  win.on("unmaximize", pushNow);

  // On close, flush the final un-maximized bounds synchronously (no await —
  // the write queue and quit-flush handler ensure the write lands).
  win.on("close", pushNow);
}

/**
 * Flush any pending window-state write.
 * Called by the quit-flush handler before Electron exits.
 * If a resize/move debounce is pending, captures and pushes it immediately.
 */
export function flushWindowState(): Promise<void> {
  if (debounceTimer !== undefined) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
    // Capture the current window state and push it so the debounced write isn't lost
    if (cachedWin) {
      const b = cachedWin.getNormalBounds();
      windowStateQueue.push({ ...b, maximized: cachedWin.isMaximized() });
    }
  }
  return windowStateQueue.flush();
}
