/**
 * Keyboard chords, shared by the config validator and the renderer.
 *
 * The vocabulary matches the accelerators the native menu already speaks
 * (`"mod+s"`, `"shift+1"`), so a config author sees one syntax rather than two.
 * `mod` resolves to Cmd on macOS and Ctrl elsewhere, which is the only part
 * that has to know what platform it is on.
 */

export interface Chord {
  /** Lowercased single character, e.g. `"s"` or `"1"`. */
  key: string;
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const MODIFIERS = new Set(["mod", "ctrl", "alt", "shift", "meta"]);

/** Parse `"mod+shift+s"`. Returns null for anything malformed. */
export function parseChord(text: string): Chord | null {
  const parts = text.split("+");
  const key = parts.pop();
  if (key === undefined || key.length !== 1) return null;

  const chord: Chord = {
    key: key.toLowerCase(),
    mod: false,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
  for (const part of parts) {
    const name = part.toLowerCase();
    if (!MODIFIERS.has(name)) return null;
    chord[name as keyof Omit<Chord, "key">] = true;
  }
  return chord;
}

/**
 * The parts of a keydown a chord cares about.
 *
 * Structural rather than `KeyboardEvent` so the core stays free of the DOM lib
 * — a real event satisfies this shape without any conversion.
 */
export interface ChordEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Whether a keydown matches a chord.
 *
 * Compares `event.key` lowercased rather than `event.code` so a chord follows
 * the character the labeler actually sees on their keys, whatever their layout.
 * Every modifier is checked in both directions — a bare `"p"` must not fire
 * while Cmd is held, or it would collide with the browser's own shortcuts.
 */
export function chordMatches(chord: Chord, event: ChordEvent, isMac: boolean): boolean {
  if (event.key.toLowerCase() !== chord.key) return false;
  const wantMeta = chord.meta || (chord.mod && isMac);
  const wantCtrl = chord.ctrl || (chord.mod && !isMac);
  return (
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.altKey === chord.alt &&
    event.shiftKey === chord.shift
  );
}

const GLYPH: Record<string, string> = { mod: "⌘", meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" };
const WORD: Record<string, string> = {
  mod: "Ctrl",
  meta: "Meta",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

/** Render a chord the way the platform writes it: `⌘S` on macOS, `Ctrl+S` elsewhere. */
export function formatChord(text: string, isMac: boolean): string {
  const parts = text.split("+");
  const key = parts.pop() ?? "";
  const mods = parts.map((m) => (isMac ? GLYPH[m.toLowerCase()] : WORD[m.toLowerCase()]) ?? m);
  const label = key.toUpperCase();
  return isMac ? [...mods, label].join("") : [...mods, label].join("+");
}

/**
 * Chords the app or the OS already owns, so a config may not claim them.
 *
 * Kept here beside the parser rather than in the menu, because the config
 * validator needs it and must not import Electron. A test asserts every
 * accelerator the native menu emits appears in this list.
 */
export const RESERVED_CHORDS: readonly string[] = [
  "mod+z",
  "mod+x",
  "mod+c",
  "mod+v",
  "mod+a",
  "mod+q",
  "mod+w",
  "mod+m",
  "mod+h",
  "mod+r",
  "mod+enter",
  "mod+shift+l",
  "mod+shift+p",
];

export const isReservedChord = (text: string): boolean =>
  RESERVED_CHORDS.includes(text.toLowerCase());
