/**
 * Contrast audit tests.
 *
 * 1. Unit tests for the conversion math (oklch → sRGB, WCAG ratio).
 * 2. CI gate: run the full required-pair matrix against the real styles.css
 *    and expect zero failures across all 8 palettes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { describe, it, expect } from "vitest";
import {
  oklchToSRGB,
  wcagRatio,
  parseOklch,
  parseThemeTokens,
  resolveColor,
  composite,
  relativeLuminance,
  worstRatio,
  buildRequiredPairs,
  WHITE,
  PALETTE_ORDER,
  type RGB,
} from "./lib/contrast.js";

// ---------------------------------------------------------------------------
// Unit tests: conversion math
// ---------------------------------------------------------------------------

describe("oklch → sRGB conversion", () => {
  it("white: oklch(1 0 0) → #fff (1, 1, 1)", () => {
    const rgb = oklchToSRGB(1, 0, 0);
    expect(rgb.r).toBeCloseTo(1, 3);
    expect(rgb.g).toBeCloseTo(1, 3);
    expect(rgb.b).toBeCloseTo(1, 3);
  });

  it("black: oklch(0 0 0) → #000 (0, 0, 0)", () => {
    const rgb = oklchToSRGB(0, 0, 0);
    expect(rgb.r).toBeCloseTo(0, 3);
    expect(rgb.g).toBeCloseTo(0, 3);
    expect(rgb.b).toBeCloseTo(0, 3);
  });

  it("neutral grey: oklch(0.6 0 0) is achromatic and near 0.50 sRGB", () => {
    // oklch(L=0.60, C=0, H=0) is a perfect grey — all channels equal.
    // L=0.60 maps to sRGB ≈ 0.502 (verified via the canonical matrices).
    const rgb = oklchToSRGB(0.6, 0, 0);
    // All channels equal for achromatic
    expect(rgb.r).toBeCloseTo(rgb.g, 4);
    expect(rgb.g).toBeCloseTo(rgb.b, 4);
    // Value is around 0.50 ± 0.02
    expect(rgb.r).toBeGreaterThan(0.48);
    expect(rgb.r).toBeLessThan(0.52);
  });
});

describe("WCAG relative luminance + contrast ratio", () => {
  it("white has luminance 1.0", () => {
    expect(relativeLuminance({ r: 1, g: 1, b: 1 })).toBeCloseTo(1, 5);
  });

  it("black has luminance 0.0", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });

  it("white on black contrast = 21:1", () => {
    const ratio = wcagRatio({ r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 0 });
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("same colour contrast = 1:1", () => {
    const grey = { r: 0.5, g: 0.5, b: 0.5 };
    expect(wcagRatio(grey, grey)).toBeCloseTo(1, 5);
  });
});

describe("parseOklch", () => {
  it("parses solid oklch", () => {
    const c = parseOklch("oklch(0.985 0.004 258)");
    expect(c).toEqual({ l: 0.985, c: 0.004, h: 258, a: 1 });
  });

  it("parses alpha oklch", () => {
    const c = parseOklch("oklch(0.985 0.004 258 / 0.8)");
    expect(c).toEqual({ l: 0.985, c: 0.004, h: 258, a: 0.8 });
  });

  it("returns null for non-oklch", () => {
    expect(parseOklch("rgb(255, 0, 0)")).toBeNull();
  });
});

describe("composite", () => {
  it("opaque fg ignores bg", () => {
    const fg = { r: 1, g: 0, b: 0, a: 1 };
    const bg: RGB = { r: 0, g: 0, b: 1 };
    const result = composite(fg, bg);
    expect(result.r).toBeCloseTo(1, 5);
    expect(result.b).toBeCloseTo(0, 5);
  });

  it("transparent fg fully shows bg", () => {
    const fg = { r: 1, g: 0, b: 0, a: 0 };
    const bg: RGB = { r: 0, g: 0, b: 1 };
    const result = composite(fg, bg);
    expect(result.r).toBeCloseTo(0, 5);
    expect(result.b).toBeCloseTo(1, 5);
  });

  it("50% fg blends 50/50", () => {
    const fg = { r: 1, g: 0, b: 0, a: 0.5 };
    const bg: RGB = { r: 0, g: 0, b: 0 };
    const result = composite(fg, bg);
    expect(result.r).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
// CI gate: zero WCAG AA failures across all 8 palettes
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const CSS_PATH = resolve(__dir, "../src/renderer/src/styles.css");

describe("WCAG 2.2 AA contrast gate (styles.css)", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  const palettes = parseThemeTokens(css);

  for (const paletteName of PALETTE_ORDER) {
    describe(paletteName, () => {
      const tokens = palettes[paletteName];

      it("palette tokens are present", () => {
        expect(tokens, `Palette ${paletteName} not found in styles.css`).toBeTruthy();
      });

      if (!tokens) return;

      const pairs = buildRequiredPairs(tokens);

      for (const pair of pairs) {
        it(`${pair.label} ≥ ${String(pair.threshold)}:1`, () => {
          const fgV = tokens[pair.fg];
          const fgRGB = fgV ? resolveColor(fgV, WHITE) : null;
          expect(fgRGB, `Cannot resolve fg token "${pair.fg}"`).not.toBeNull();
          if (!fgRGB) return;

          const ratio = worstRatio(fgRGB, pair.bg, tokens);
          expect(
            ratio,
            `${paletteName}: ${pair.label} ratio ${ratio.toFixed(2)} < ${String(pair.threshold)}`,
          ).toBeGreaterThanOrEqual(pair.threshold);
        });
      }
    });
  }
});
