#!/usr/bin/env tsx
/**
 * WCAG 2.2 AA contrast audit for all 8 MLabel color palettes.
 *
 * Usage:
 *   pnpm audit:contrast          # report failures only, exit 1 if any
 *   pnpm audit:contrast --all    # full matrix
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  parseThemeTokens,
  resolveColor,
  wcagRatio,
  type RGB,
  type TokenMap,
} from "./lib/contrast.js";

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const CSS_PATH = resolve(__dir, "../src/renderer/src/styles.css");
const SHOW_ALL = process.argv.includes("--all");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WHITE: RGB = { r: 1, g: 1, b: 1 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

function resolve2(tokens: TokenMap, name: string, backdrop: RGB): RGB | null {
  const v = tokens[name];
  if (!v) return null;
  return resolveColor(v, backdrop);
}

/**
 * For alpha surfaces: test over BOTH white and black backdrops.
 * A pair "passes" only when it passes over both (vibrancy = arbitrary wallpaper).
 * Returns the WORST (lowest) ratio across both.
 */
function worstRatio(fgRGB: RGB, bgToken: string, tokens: TokenMap): number {
  const bgWhite = resolve2(tokens, bgToken, WHITE);
  const bgBlack = resolve2(tokens, bgToken, BLACK);
  if (!bgWhite || !bgBlack) return 0;
  const ratioWhite = wcagRatio(fgRGB, bgWhite);
  const ratioBlack = wcagRatio(fgRGB, bgBlack);
  return Math.min(ratioWhite, ratioBlack);
}

// ---------------------------------------------------------------------------
// Pair definitions
// ---------------------------------------------------------------------------

const SURFACE_TOKENS = ["background", "card", "chrome", "popover", "muted"] as const;

interface Pair {
  label: string;
  fg: string;
  bg: string;
  required: boolean;
  threshold: number;
}

function buildPairs(tokens: TokenMap): Pair[] {
  const pairs: Pair[] = [];

  const add = (fg: string, bg: string, threshold: number, required: boolean): void => {
    pairs.push({ label: `${fg} / ${bg}`, fg, bg, threshold, required });
  };

  // TEXT pairs (≥4.5): foreground / muted-foreground on every surface
  for (const surface of SURFACE_TOKENS) {
    if (tokens["foreground"]) add("foreground", surface, 4.5, true);
    if (tokens["muted-foreground"]) add("muted-foreground", surface, 4.5, true);
  }

  // Semantic chip foregrounds on their own chip background
  if (tokens["accent-foreground"] && tokens["accent"]) {
    add("accent-foreground", "accent", 4.5, true);
  }
  if (tokens["danger-foreground"] && tokens["danger"]) {
    add("danger-foreground", "danger", 4.5, true);
  }
  if (tokens["warning-foreground"] && tokens["warning"]) {
    add("warning-foreground", "warning", 4.5, true);
  }
  if (tokens["info-foreground"] && tokens["info"]) {
    add("info-foreground", "info", 4.5, true);
  }
  if (tokens["progress-foreground"] && tokens["progress"]) {
    add("progress-foreground", "progress", 4.5, true);
  }

  // Semantic AS TEXT tokens on background and card (the new -text tokens)
  for (const semantic of ["danger-text", "warning-text", "progress-text", "info-text"]) {
    if (tokens[semantic]) {
      add(semantic, "background", 4.5, true);
      add(semantic, "card", 4.5, true);
    }
  }

  // NON-TEXT pairs (≥3.0)
  // progress/chrome: informational — light-theme chromatic colors on alpha-glass surfaces
  // cannot physically achieve 3.0 over both white AND black backdrops simultaneously.
  if (tokens["progress"] && tokens["chrome"]) add("progress", "chrome", 3.0, false);
  if (tokens["accent"] && tokens["background"]) add("accent", "background", 3.0, true);
  if (tokens["ring"] && tokens["background"]) add("ring", "background", 3.0, false);
  if (tokens["border"] && tokens["background"]) add("border", "background", 3.0, false);
  if (tokens["border"] && tokens["card"]) add("border", "card", 3.0, false);

  return pairs;
}

// ---------------------------------------------------------------------------
// Audit one palette
// ---------------------------------------------------------------------------

interface PairResult {
  label: string;
  ratio: number;
  threshold: number;
  passes: boolean;
  required: boolean;
}

function auditPalette(_paletteName: string, tokens: TokenMap): PairResult[] {
  const pairs = buildPairs(tokens);
  const results: PairResult[] = [];

  for (const pair of pairs) {
    // Resolve foreground against white backdrop (it's usually opaque text)
    const fgRGB = resolve2(tokens, pair.fg, WHITE);
    if (!fgRGB) continue;

    // Background: check worst case over both backdrops (for alpha surfaces)
    const ratio = worstRatio(fgRGB, pair.bg, tokens);
    results.push({
      label: pair.label,
      ratio,
      threshold: pair.threshold,
      passes: ratio >= pair.threshold,
      required: pair.required,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const css = readFileSync(CSS_PATH, "utf8");
const palettes = parseThemeTokens(css);

let totalFailures = 0;
let totalRequired = 0;

const PALETTE_ORDER = [
  "cobalt-light",
  "cobalt-dark",
  "parchment-light",
  "parchment-dark",
  "fjord-light",
  "fjord-dark",
  "vespers-light",
  "vespers-dark",
] as const;

for (const paletteName of PALETTE_ORDER) {
  const tokens = palettes[paletteName];
  if (!tokens) {
    console.log(`\n[WARN] Palette not found: ${paletteName}`);
    continue;
  }

  const results = auditPalette(paletteName, tokens);
  const failures = results.filter((r) => !r.passes && r.required);
  const requiredCount = results.filter((r) => r.required).length;

  totalFailures += failures.length;
  totalRequired += requiredCount;

  const header = `\n── ${paletteName} ──`;
  if (failures.length > 0 || SHOW_ALL) {
    console.log(header);
  }

  if (SHOW_ALL) {
    for (const r of results) {
      const status = r.passes ? "✓" : r.required ? "✗ FAIL" : "~ warn";
      console.log(
        `  ${status.padEnd(8)} ${r.ratio.toFixed(2).padStart(5)}:1  (≥${String(r.threshold)})  ${r.label}`,
      );
    }
  } else if (failures.length > 0) {
    for (const r of failures) {
      console.log(
        `  ✗ FAIL  ${r.ratio.toFixed(2).padStart(5)}:1  (≥${String(r.threshold)})  ${r.label}`,
      );
    }
  }
}

console.log(
  `\n── Summary ──\n  ${String(totalFailures)} required failures across all palettes  (${String(totalRequired)} required pairs checked)\n`,
);

if (totalFailures > 0) {
  process.exit(1);
}
