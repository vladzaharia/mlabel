import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fc, test as fcTest } from "@fast-check/vitest";

// ---------------------------------------------------------------------------
// Pure-logic tests — no Electron dependency
// ---------------------------------------------------------------------------
import { sanitizeWindowState } from "./window-state";
import type { DisplayRect, WindowState } from "./window-state";

const DEFAULTS = { width: 1100, height: 800 };
const MIN = { width: 720, height: 560 };

const display1: DisplayRect = { x: 0, y: 0, width: 1920, height: 1040 };
const display2: DisplayRect = { x: 1920, y: 0, width: 2560, height: 1440 };

describe("sanitizeWindowState", () => {
  // --- Garbage / malformed input → defaults ---

  it("returns defaults for undefined input", () => {
    const result = sanitizeWindowState(undefined, [display1], DEFAULTS, MIN);
    expect(result).toEqual({ width: 1100, height: 800, maximized: false });
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  it("returns defaults for null input", () => {
    const result = sanitizeWindowState(null, [display1], DEFAULTS, MIN);
    expect(result).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it("returns defaults for a non-object value", () => {
    const result = sanitizeWindowState(42, [display1], DEFAULTS, MIN);
    expect(result).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it("returns defaults for an empty object", () => {
    const result = sanitizeWindowState({}, [display1], DEFAULTS, MIN);
    expect(result).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it("returns defaults when width/height are strings", () => {
    const result = sanitizeWindowState({ width: "1100", height: "800" }, [display1], DEFAULTS, MIN);
    expect(result).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it("returns defaults when width is NaN", () => {
    const result = sanitizeWindowState({ width: NaN, height: 800 }, [display1], DEFAULTS, MIN);
    expect(result).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it("returns defaults when dimensions are negative", () => {
    const result = sanitizeWindowState({ width: -100, height: -200 }, [display1], DEFAULTS, MIN);
    // Negative values are not finite+positive → defaults then clamped to min
    expect(result.width).toBeGreaterThanOrEqual(MIN.width);
    expect(result.height).toBeGreaterThanOrEqual(MIN.height);
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  it("returns defaults when there are no displays", () => {
    const result = sanitizeWindowState({ width: 1100, height: 800, x: 0, y: 0 }, [], DEFAULTS, MIN);
    // No displays means no intersection possible and no largest-display dims
    expect(result.width).toBe(DEFAULTS.width);
    expect(result.height).toBe(DEFAULTS.height);
    expect(result.maximized).toBe(false);
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  // --- Valid bounds fully inside display → preserved exactly ---

  it("preserves bounds when fully inside a display", () => {
    const saved: WindowState = { width: 1000, height: 700, x: 100, y: 50, maximized: false };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result).toEqual(saved);
  });

  it("preserves bounds on the second of two displays", () => {
    const saved: WindowState = {
      width: 1000,
      height: 700,
      x: 2000, // inside display2 (x: 1920..4480)
      y: 50,
      maximized: false,
    };
    const result = sanitizeWindowState(saved, [display1, display2], DEFAULTS, MIN);
    expect(result).toEqual(saved);
  });

  // --- Display removed → size kept, position dropped ---

  it("drops x/y when window is on a removed display", () => {
    // display2 removed, window was positioned there
    const saved: WindowState = {
      width: 800,
      height: 600,
      x: 3000, // off-screen (display2 gone)
      y: 200,
      maximized: false,
    };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  // --- Sliver intersection logic ---

  // Title strip is the top 44px with at least 100px wide → 100×44 threshold.
  // We test around the exact threshold.

  it("drops x/y when title-strip intersection is below 100×44", () => {
    // Window's title strip (top 44px, 100px wide) barely misses the display:
    // x position places only 99px of the title bar visible on display1
    const saved: WindowState = {
      width: 800,
      height: 600,
      x: 1920 - 99, // right edge of window is 1px into display2, 99px on display1
      y: 0,
      maximized: false,
    };
    // Only one display: display1 (0..1920), so the strip visible = 99px wide → below 100
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  it("keeps x/y when title-strip intersection is exactly at 100×44 threshold", () => {
    // Strip of window at x=1820, width=800 → on display1: x=1820..1920 → exactly 100px wide
    const saved: WindowState = {
      width: 800,
      height: 600,
      x: 1820, // 1920-100=1820 → exactly 100px visible on display1
      y: 0, // top: y=0, strip is y=0..44 which fully overlaps display1 (y=0..1040)
      maximized: false,
    };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.x).toBe(1820);
    expect(result.y).toBe(0);
  });

  it("drops x/y when the title bar is below the display (y too large)", () => {
    // Window's top edge (title bar) is off the bottom of display1
    const saved: WindowState = {
      width: 800,
      height: 600,
      x: 100,
      y: 1100, // below display1 bottom (1040), so strip y=1100..1144 → no intersection
      maximized: false,
    };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  it("drops x/y when the title bar is above display1 but partially visible", () => {
    // Window top is at y=-45: title strip from y=-45 to -1 — below display top=0 by 44px
    // so no intersection with display1 (which starts at y=0)
    const saved: WindowState = {
      width: 800,
      height: 600,
      x: 100,
      y: -45, // strip from y=-45 to y=-1, fully above display1 → no overlap
      maximized: false,
    };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.x).toBeUndefined();
    expect(result.y).toBeUndefined();
  });

  // --- Clamping ---

  it("clamps oversized window to largest display workArea", () => {
    // display2 is 2560×1440
    const saved: WindowState = {
      width: 9999,
      height: 9999,
      x: 1920,
      y: 0,
      maximized: false,
    };
    const result = sanitizeWindowState(saved, [display1, display2], DEFAULTS, MIN);
    // Largest display dims: display2 is 2560×1440
    expect(result.width).toBeLessThanOrEqual(2560);
    expect(result.height).toBeLessThanOrEqual(1440);
  });

  it("clamps undersized width to min", () => {
    const saved: WindowState = { width: 400, height: 800, x: 100, y: 50, maximized: false };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.width).toBe(MIN.width);
  });

  it("clamps undersized height to min", () => {
    const saved: WindowState = { width: 1000, height: 300, x: 100, y: 50, maximized: false };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.height).toBe(MIN.height);
  });

  // --- maximized passthrough ---

  it("passes through maximized:true", () => {
    const saved: WindowState = { width: 1100, height: 800, x: 0, y: 0, maximized: true };
    const result = sanitizeWindowState(saved, [display1], DEFAULTS, MIN);
    expect(result.maximized).toBe(true);
  });

  it("defaults maximized to false when missing", () => {
    const result = sanitizeWindowState(
      { width: 1000, height: 700, x: 100, y: 50 },
      [display1],
      DEFAULTS,
      MIN,
    );
    expect(result.maximized).toBe(false);
  });

  it("coerces non-boolean maximized to false (truthy number)", () => {
    const result = sanitizeWindowState(
      { width: 1000, height: 700, x: 100, y: 50, maximized: 1 },
      [display1],
      DEFAULTS,
      MIN,
    );
    // Only true boolean passes through
    expect(result.maximized).toBe(false);
  });

  // --- fast-check property test ---

  fcTest.prop(
    [
      // Arbitrary saved state: any JSON-like value
      fc.oneof(
        fc.constant(undefined),
        fc.constant(null),
        fc.integer(),
        fc.string(),
        fc.record({
          width: fc.oneof(fc.integer({ min: -500, max: 5000 }), fc.constant(NaN)),
          height: fc.oneof(fc.integer({ min: -500, max: 3000 }), fc.constant(NaN)),
          x: fc.option(fc.integer({ min: -2000, max: 6000 }), { nil: undefined }),
          y: fc.option(fc.integer({ min: -2000, max: 3000 }), { nil: undefined }),
          maximized: fc.boolean(),
        }),
      ),
      // Display list: 1-3 displays
      fc.array(
        fc.record({
          x: fc.integer({ min: 0, max: 3840 }),
          y: fc.integer({ min: 0, max: 200 }),
          width: fc.integer({ min: 800, max: 3840 }),
          height: fc.integer({ min: 600, max: 2160 }),
        }),
        { minLength: 1, maxLength: 3 },
      ),
    ],
    { numRuns: 500 },
  )("property: output always valid", (saved, displays) => {
    const result = sanitizeWindowState(saved, displays, DEFAULTS, MIN);

    // 1. min ≤ width/height ≤ largest-display-dims
    const maxW = Math.max(...displays.map((d) => d.width));
    const maxH = Math.max(...displays.map((d) => d.height));
    expect(result.width).toBeGreaterThanOrEqual(MIN.width);
    expect(result.height).toBeGreaterThanOrEqual(MIN.height);
    expect(result.width).toBeLessThanOrEqual(maxW);
    expect(result.height).toBeLessThanOrEqual(maxH);

    // 2. maximized is always a boolean
    expect(typeof result.maximized).toBe("boolean");

    // 3. if x/y are defined, the title-strip must intersect a display by ≥100×44
    if (result.x !== undefined && result.y !== undefined) {
      const TITLE_H = 44;
      // Intentionally mirror THRESH_W and THRESH_H from the main code independently
      const PROP_THRESH_W = 100;
      const PROP_THRESH_H = 44;
      const stripX = result.x;
      const stripY = result.y;
      const stripW = result.width;
      const stripH = TITLE_H;

      const hasIntersection = displays.some((d) => {
        const ix = Math.min(stripX + stripW, d.x + d.width) - Math.max(stripX, d.x);
        const iy = Math.min(stripY + stripH, d.y + d.height) - Math.max(stripY, d.y);
        return ix >= PROP_THRESH_W && iy >= PROP_THRESH_H;
      });
      expect(hasIntersection).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Electron-glue tests (mocked Electron)
// ---------------------------------------------------------------------------

const { getPathMock, getAllDisplaysMock } = vi.hoisted(() => ({
  getPathMock: vi.fn<() => string>(),
  getAllDisplaysMock: vi.fn<() => { workArea: DisplayRect }[]>(),
}));

vi.mock("electron", () => ({
  app: { getPath: getPathMock },
  screen: { getAllDisplays: getAllDisplaysMock },
}));

import { loadWindowState, trackWindowState } from "./window-state";

describe("loadWindowState (Electron glue)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mlabel-window-state-"));
    getPathMock.mockReturnValue(dir);
    getAllDisplaysMock.mockReturnValue([{ workArea: display1 }]);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns defaults when no file exists", async () => {
    const state = await loadWindowState();
    expect(state).toEqual({ width: 1100, height: 800, maximized: false });
  });

  it("returns sanitized state from a valid file", async () => {
    const { writeJsonAtomic } = await import("./services/atomic-write");
    const statePath = join(dir, "window-state.json");
    const payload = { width: 900, height: 650, x: 100, y: 50, maximized: false };
    await writeJsonAtomic(statePath, payload, { fsync: false });

    const state = await loadWindowState();
    expect(state).toEqual(payload);
  });

  it("returns defaults when file contains garbage", async () => {
    const { writeJsonAtomic } = await import("./services/atomic-write");
    const statePath = join(dir, "window-state.json");
    await writeJsonAtomic(statePath, "not-an-object", { fsync: false });

    const state = await loadWindowState();
    expect(state).toEqual({ width: 1100, height: 800, maximized: false });
  });
});

describe("trackWindowState (Electron glue)", () => {
  let dir: string;
  let winListeners: Record<string, ((...args: unknown[]) => void)[]>;
  let mockWin: {
    on: (event: string, fn: (...args: unknown[]) => void) => void;
    getNormalBounds: () => { x: number; y: number; width: number; height: number };
    isMaximized: () => boolean;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mlabel-window-track-"));
    getPathMock.mockReturnValue(dir);
    getAllDisplaysMock.mockReturnValue([{ workArea: display1 }]);
    winListeners = {};
    mockWin = {
      on: (event: string, fn: (...args: unknown[]) => void) => {
        winListeners[event] ??= [];
        winListeners[event].push(fn);
      },
      getNormalBounds: vi.fn(() => ({ x: 100, y: 50, width: 900, height: 650 })),
      isMaximized: vi.fn(() => false),
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("pushes to the write queue on the close event using getNormalBounds", async () => {
    const { flushWindowState } = await import("./window-state");

    // Re-import to get fresh module state (vi.mock caches the mock)
    trackWindowState(mockWin as Parameters<typeof trackWindowState>[0]);

    // Trigger the close event
    winListeners["close"]?.[0]?.();

    // Flush ensures the write completes
    await flushWindowState();

    const { readJsonSafe } = await import("./services/atomic-write");
    const statePath = join(dir, "window-state.json");
    const saved = await readJsonSafe<WindowState>(statePath);
    expect(saved?.width).toBe(900);
    expect(saved?.height).toBe(650);
    expect(saved?.x).toBe(100);
    expect(saved?.y).toBe(50);
    expect(saved?.maximized).toBe(false);
  });

  it("flushes debounced resize write without timing out", async () => {
    const { flushWindowState } = await import("./window-state");
    vi.useFakeTimers();

    try {
      trackWindowState(mockWin as Parameters<typeof trackWindowState>[0]);

      // Trigger a resize event — schedules write via 500ms debounce
      winListeners["resize"]?.[0]?.();

      // Do NOT advance timers past the debounce — flush should still work
      // and write the pending state without losing it
      await flushWindowState();

      const { readJsonSafe } = await import("./services/atomic-write");
      const statePath = join(dir, "window-state.json");
      const saved = await readJsonSafe<WindowState>(statePath);
      // Verify the debounced resize state was written (not lost)
      expect(saved?.width).toBe(900);
      expect(saved?.height).toBe(650);
    } finally {
      vi.useRealTimers();
    }
  });
});
