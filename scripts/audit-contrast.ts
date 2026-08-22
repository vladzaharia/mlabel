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
  worstRatio,
  buildRequiredPairs,
  WHITE,
  WCAG_AA_NON_TEXT,
  PALETTE_ORDER,
  type TokenMap,
} from "./lib/contrast.js";

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const CSS_PATH = resolve(__dir, "../src/renderer/src/styles.css");
const SHOW_ALL = process.argv.includes("--all");

// ---------------------------------------------------------------------------
// Pair definitions
// ---------------------------------------------------------------------------

interface Pair {
  label: string;
  fg: string;
  bg: string;
  required: boolean;
  threshold: number;
}

function buildPairs(tokens: TokenMap): Pair[] {
  // Required pairs from shared lib
  const required = buildRequiredPairs(tokens).map((p) => ({ ...p, required: true }));

  // Informational (non-required) pairs: ring/border/progress-on-chrome
  // Light-theme chromatic colors on alpha-glass surfaces cannot physically
  // achieve 3.0 over both white AND black backdrops simultaneously.
  // A focus ring you can't see makes keyboard-first operation guesswork, so it
  // is enforced rather than merely reported. It measured 1.15-1.22:1 in every
  // light palette before the alpha came off it.
  if (tokens["ring"] && tokens["background"]) {
    required.push({
      label: "ring / background",
      fg: "ring",
      bg: "background",
      required: true,
      threshold: WCAG_AA_NON_TEXT,
    });
  }

  const informational: Pair[] = [];
  const addInfo = (fg: string, bg: string): void => {
    if (tokens[fg] && tokens[bg]) {
      informational.push({
        label: `${fg} / ${bg}`,
        fg,
        bg,
        threshold: WCAG_AA_NON_TEXT,
        required: false,
      });
    }
  };
  addInfo("progress", "chrome");
  addInfo("border", "background");
  addInfo("border", "card");

  return [...required, ...informational];
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

function auditPalette(tokens: TokenMap): PairResult[] {
  const pairs = buildPairs(tokens);
  const results: PairResult[] = [];

  for (const pair of pairs) {
    // Resolve foreground against white backdrop (it's usually opaque text)
    const fgV = tokens[pair.fg];
    if (!fgV) continue;
    const fgRGB = resolveColor(fgV, WHITE);
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

for (const paletteName of PALETTE_ORDER) {
  const tokens = palettes[paletteName];
  if (!tokens) {
    console.log(`\n[WARN] Palette not found: ${paletteName}`);
    continue;
  }

  const results = auditPalette(tokens);
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
