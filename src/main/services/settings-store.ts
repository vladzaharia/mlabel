/**
 * Preferences that outlive any one file.
 *
 * Two layers, following `window-state.ts`:
 *  1. Pure logic (`sanitizeSettings`, `pruneShortcuts`) — Electron-free.
 *  2. Electron glue (`initSettings`, `getSettings`, `setSettings`, …).
 *
 * Deliberately separate from `session.json`, which is one file's labels and is
 * discarded outright on a version mismatch. A misread session is data loss; a
 * misread preference is an inconvenience, so this reader salvages field by
 * field instead of throwing the file away.
 */

import { join } from "node:path";
import { app } from "electron";
import { existsSync } from "node:fs";
import { isReservedChord, parseChord } from "@core/shortcuts";
import { DEFAULT_MODEL_ID, MODELS, type AppSettings, type ColorTheme, type ThemeMode } from "@core";
import { readJsonSafe, writeJsonAtomic } from "./atomic-write";
import { createWriteQueue } from "./write-queue";

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  themeMode: "system",
  colorTheme: "cobalt",
  shortcuts: {},
  updateChecks: true,
  // Off by default. A config saying the feature is permitted is not the same as
  // a labeler asking for a gigabyte of weights.
  aiEnabled: false,
  aiModelId: DEFAULT_MODEL_ID,
};

const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];
const COLOR_THEMES: readonly ColorTheme[] = ["cobalt", "parchment", "fjord", "vespers"];

const oneOf = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/**
 * Keep only the chord overrides this build can honour.
 *
 * The reserved check is the load-bearing one: without it, hand-editing the file
 * would be enough to take Paste away from the notes box, with nothing on screen
 * to explain why.
 */
function sanitizeShortcuts(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, chords] of Object.entries(value as Record<string, unknown>)) {
    if (key === "" || !Array.isArray(chords)) continue;
    const kept = chords.filter(
      (chord): chord is string =>
        typeof chord === "string" && parseChord(chord) !== null && !isReservedChord(chord),
    );
    // An entry that lost every chord it had is dropped rather than kept as an
    // empty array — empty means "the labeler unbound this", which is a claim
    // the file no longer supports once its chords turned out to be unusable.
    if (kept.length > 0 || chords.length === 0) out[key] = kept;
  }
  return out;
}

/** Validate and normalise a raw (potentially hand-edited) settings file. */
export function sanitizeSettings(saved: unknown): AppSettings {
  if (typeof saved !== "object" || saved === null || Array.isArray(saved)) {
    return { ...DEFAULT_SETTINGS, shortcuts: {} };
  }
  const raw = saved as Record<string, unknown>;
  return {
    version: SETTINGS_VERSION,
    themeMode: oneOf(THEME_MODES, raw["themeMode"], DEFAULT_SETTINGS.themeMode),
    colorTheme: oneOf(COLOR_THEMES, raw["colorTheme"], DEFAULT_SETTINGS.colorTheme),
    shortcuts: sanitizeShortcuts(raw["shortcuts"]),
    // Anything that is not an explicit `false` reads as permitted.
    updateChecks: raw["updateChecks"] !== false,
    aiEnabled: raw["aiEnabled"] === true,
    aiModelId: MODELS.some((m) => m.id === raw["aiModelId"])
      ? (raw["aiModelId"] as string)
      : DEFAULT_MODEL_ID,
  };
}

/** The separator between a config path and the binding it scopes. */
const SCOPE = "::";

/**
 * Drop overrides belonging to configs that are no longer on disk.
 *
 * Config-scoped keys accumulate forever otherwise — every project a labeler
 * ever opened leaves its bindings behind. Global bindings carry no path and are
 * always kept.
 */
export function pruneShortcuts(
  shortcuts: Record<string, string[]>,
  configExists: (path: string) => boolean,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, chords] of Object.entries(shortcuts)) {
    const at = key.indexOf(SCOPE);
    // `indexOf`, not `split(":")`: a Windows path is `C:\work\a.jsonc`, and
    // splitting on a single colon would mangle every one of them.
    if (at === -1 || configExists(key.slice(0, at))) out[key] = chords;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Electron glue
// ---------------------------------------------------------------------------

const SETTINGS_FILENAME = "settings.json";

let cached: AppSettings = { ...DEFAULT_SETTINGS };

const settingsQueue = createWriteQueue<AppSettings>(async (settings) => {
  const path = join(app.getPath("userData"), SETTINGS_FILENAME);
  await writeJsonAtomic(path, settings, { fsync: false });
});

const settingsPath = (): string => join(app.getPath("userData"), SETTINGS_FILENAME);

/**
 * Read the settings file once, at startup.
 *
 * Must run before `registerIpc()`: the config service composes the effective
 * update-check policy from these settings the moment a config loads, and the
 * renderer can trigger that as soon as IPC is listening.
 */
export async function initSettings(): Promise<AppSettings> {
  const saved = await readJsonSafe<unknown>(settingsPath());
  const settings = sanitizeSettings(saved);
  cached = { ...settings, shortcuts: pruneShortcuts(settings.shortcuts, existsSync) };
  return cached;
}

/** The settings as they currently stand. Synchronous by design. */
export const getSettings = (): AppSettings => cached;

/** Merge a patch, sanitise the result, and persist it. Returns what is now in force. */
export function setSettings(patch: Partial<AppSettings>): AppSettings {
  cached = sanitizeSettings({ ...cached, ...patch });
  settingsQueue.push(cached);
  return cached;
}

/** Back to the defaults, on disk as well as in memory. */
export function resetSettings(): AppSettings {
  cached = { ...DEFAULT_SETTINGS, shortcuts: {} };
  settingsQueue.push(cached);
  return cached;
}

/** Flush any pending settings write. Called by the quit-flush handler. */
export const flushSettings = (): Promise<void> => settingsQueue.flush();
