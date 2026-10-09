/**
 * Keyboard chords, shared by the config validator, the renderer and the
 * settings pane.
 *
 * The vocabulary matches the accelerators the native menu already speaks
 * (`"mod+s"`, `"shift+1"`), so a config author sees one syntax rather than two.
 * `mod` resolves to Cmd on macOS and Ctrl elsewhere, which is the only part
 * that has to know what platform it is on.
 */

export interface Chord {
  /**
   * The key, lowercased. Either a single character (`"s"`, `"?"`) or the
   * lowercased `KeyboardEvent.key` of a named key (`"enter"`, `"arrowleft"`,
   * and `" "` for Space).
   */
  key: string;
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** A key with a name rather than a character, and how to spell it everywhere. */
export interface NamedKey {
  /** Canonical authoring token, as written in a config or in settings. */
  token: string;
  /** Lowercased `KeyboardEvent.key` — what {@link Chord.key} holds. */
  key: string;
  /** `aria-keyshortcuts` spelling. WAI-ARIA says "Space"; the rest are DOM names. */
  aria: string;
  /** Visible label on macOS. */
  glyph: string;
  /** Visible label elsewhere. */
  word: string;
}

/**
 * The keys that have names instead of characters.
 *
 * `Chord.key` stores the *lowercased* `KeyboardEvent.key`, which is what lets
 * `chordMatches` stay a plain string comparison: `" ".toLowerCase()` is `" "`
 * and `"ArrowLeft".toLowerCase()` is `"arrowleft"`.
 */
export const NAMED_KEYS: readonly NamedKey[] = [
  { token: "space", key: " ", aria: "Space", glyph: "␣", word: "Space" },
  { token: "enter", key: "enter", aria: "Enter", glyph: "⏎", word: "Enter" },
  { token: "escape", key: "escape", aria: "Escape", glyph: "⎋", word: "Esc" },
  { token: "tab", key: "tab", aria: "Tab", glyph: "⇥", word: "Tab" },
  { token: "left", key: "arrowleft", aria: "ArrowLeft", glyph: "←", word: "←" },
  { token: "right", key: "arrowright", aria: "ArrowRight", glyph: "→", word: "→" },
  { token: "up", key: "arrowup", aria: "ArrowUp", glyph: "↑", word: "↑" },
  { token: "down", key: "arrowdown", aria: "ArrowDown", glyph: "↓", word: "↓" },
  { token: "home", key: "home", aria: "Home", glyph: "↖", word: "Home" },
  { token: "end", key: "end", aria: "End", glyph: "↘", word: "End" },
  { token: "backspace", key: "backspace", aria: "Backspace", glyph: "⌫", word: "Backspace" },
  { token: "delete", key: "delete", aria: "Delete", glyph: "⌦", word: "Del" },
];

/**
 * Spellings an author may reasonably reach for, folded onto the canonical token.
 *
 * Exported as {@link CHORD_KEY_ALIASES} so the config schema builds its pattern
 * from this same table — the published grammar and the runtime parser cannot
 * drift apart if there is only one list.
 */
const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  spacebar: "space",
  return: "enter",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  del: "delete",
};

/** The alias spellings, for anyone building a grammar over the same vocabulary. */
export const CHORD_KEY_ALIASES: readonly string[] = Object.keys(KEY_ALIASES);

const BY_TOKEN = new Map(NAMED_KEYS.map((n) => [n.token, n]));
const BY_KEY = new Map(NAMED_KEYS.map((n) => [n.key, n]));

/** Resolve an authoring token to its named key, following aliases. */
function namedKey(token: string): NamedKey | undefined {
  const lower = token.toLowerCase();
  return BY_TOKEN.get(KEY_ALIASES[lower] ?? lower);
}

/**
 * Modifier spellings. `cmd` and `opt` are the names on a Mac keyboard's own
 * keycaps, so an author reaching for them should not get a validation error.
 */
const MODIFIER_ALIASES: Record<string, keyof Omit<Chord, "key">> = {
  mod: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  opt: "alt",
  option: "alt",
  shift: "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
};

/** The order modifiers are written in when a chord is canonicalised. */
const MODIFIER_ORDER: readonly (keyof Omit<Chord, "key">)[] = [
  "mod",
  "meta",
  "ctrl",
  "alt",
  "shift",
];

/** Parse `"mod+shift+s"`, `"cmd+enter"` or `"space"`. Null for anything malformed. */
export function parseChord(text: string): Chord | null {
  const parts = text.split("+");
  const key = parts.pop();
  if (key === undefined || key === "") return null;

  const named = namedKey(key);
  if (named === undefined && key.length !== 1) return null;

  const chord: Chord = {
    key: named?.key ?? key.toLowerCase(),
    mod: false,
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };
  for (const part of parts) {
    const name = MODIFIER_ALIASES[part.toLowerCase()];
    if (name === undefined) return null;
    chord[name] = true;
  }
  return chord;
}

/**
 * Whether a chord is a plain keystroke with no modifier held.
 *
 * Bare chords are the ones that collide with typing: `"c"` selecting a choice
 * must not fire while the caret is in the notes box, or the letter can never be
 * typed. A chord carrying a modifier has no such conflict, which is what lets
 * `mod+`-style accelerators stay reachable from inside a text field.
 */
export function isBareChord(chord: Chord): boolean {
  return !chord.mod && !chord.ctrl && !chord.alt && !chord.shift && !chord.meta;
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
 * Whether the shift state is worth comparing for this key.
 *
 * For a letter, a digit, Space or a named key, Shift is a separate fact: `⇧→`
 * and `→` are different chords. For punctuation it is not — `?` *is* Shift+`/`
 * on nearly every layout, so the browser reports `shiftKey: true` for a chord
 * an author wrote as plain `?`. Comparing it again would make `?` unmatchable.
 */
function shiftIsSignificant(key: string): boolean {
  return /^[a-z0-9]$/.test(key) || BY_KEY.has(key);
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
  const key = event.key.toLowerCase();
  if (key !== chord.key) return false;
  const wantMeta = chord.meta || (chord.mod && isMac);
  const wantCtrl = chord.ctrl || (chord.mod && !isMac);
  return (
    event.metaKey === wantMeta &&
    event.ctrlKey === wantCtrl &&
    event.altKey === chord.alt &&
    (!shiftIsSignificant(chord.key) || event.shiftKey === chord.shift)
  );
}

/** The authoring token for a parsed chord's key. */
function tokenOf(chord: Chord): string {
  return BY_KEY.get(chord.key)?.token ?? chord.key;
}

/**
 * A chord in one fixed spelling: canonical modifier order, canonical key token,
 * lowercase. Two texts naming the same keystroke canonicalise to one string,
 * which is what makes conflict detection and the reserved list reliable.
 */
export function canonicalChord(text: string): string | null {
  const chord = parseChord(text);
  if (!chord) return null;
  const mods = MODIFIER_ORDER.filter((name) => chord[name]);
  return [...mods, tokenOf(chord)].join("+");
}

/** Key values that are a modifier being held, not a keystroke to record. */
const MODIFIER_KEYS = new Set(["shift", "meta", "control", "alt", "altgraph", "dead", "os"]);

/**
 * Build chord text from a keydown — the inverse of {@link chordMatches}, for a
 * press-a-key capture UI.
 *
 * Null while only modifiers are held, so a capture control can stay listening
 * rather than committing `shift` as a shortcut.
 *
 * The platform modifier is always written as `mod`, never as `meta` or `ctrl`:
 * a chord recorded on a Mac has to keep meaning the same thing on Windows.
 */
export function chordFromEvent(event: ChordEvent, isMac: boolean): string | null {
  const key = event.key.toLowerCase();
  if (key === "" || MODIFIER_KEYS.has(key)) return null;

  const chord: Chord = {
    key,
    mod: isMac ? event.metaKey : event.ctrlKey,
    meta: isMac ? false : event.metaKey,
    ctrl: isMac ? event.ctrlKey : false,
    alt: event.altKey,
    shift: event.shiftKey && shiftIsSignificant(key),
  };
  const mods = MODIFIER_ORDER.filter((name) => chord[name]);
  return [...mods, tokenOf(chord)].join("+");
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
  const named = namedKey(key);
  const label = named ? (isMac ? named.glyph : named.word) : key.toUpperCase();
  // A named key spelled as a word needs a separator even on macOS, or
  // `⇧Space` would run together into something unreadable.
  const joiner = isMac && (!named || named.glyph.length === 1) ? "" : "+";
  return [...mods, label].join(isMac ? joiner : "+");
}

/** ARIA spells modifiers with `KeyboardEvent` names — `Control`, never `Ctrl`. */
const ARIA_MOD: Record<string, string> = {
  meta: "Meta",
  ctrl: "Control",
  alt: "Alt",
  shift: "Shift",
};

/**
 * A chord as `aria-keyshortcuts` wants it: `"Meta+V"`, not `"⌘V"`.
 *
 * The visible badge is glyphs, which a screen reader would read as punctuation
 * or skip entirely. This is the same chord spelled for assistive tech, so the
 * badge can stay decorative (`aria-hidden`) without the shortcut going unheard.
 */
export function ariaChord(text: string, isMac: boolean): string {
  const parts = text.split("+");
  const key = parts.pop() ?? "";
  const mods = parts.map((part) => {
    const name = part.toLowerCase();
    if (name === "mod") return isMac ? "Meta" : "Control";
    if (name === "cmd" || name === "command") return "Meta";
    if (name === "opt" || name === "option") return "Alt";
    return ARIA_MOD[name] ?? part;
  });
  const named = namedKey(key);
  return [...mods, named?.aria ?? key.toUpperCase()].join("+");
}

/**
 * Chords the app or the OS already owns, so a config may not claim them.
 *
 * Kept here beside the parser rather than in the menu, because the config
 * validator needs it and must not import Electron. A test asserts every
 * accelerator the native menu emits appears in this list.
 *
 * The app-driven half — Enter, Space, the arrows — is here because those move
 * through records. A config binding a choice to Enter would make the record
 * both answer and advance on one keystroke.
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
  "mod+,",
  "mod+shift+l",
  "mod+shift+p",
  "enter",
  "space",
  "left",
  "right",
  "shift+left",
  "shift+right",
];

/**
 * Every spelling that names a reserved keystroke on *some* platform.
 *
 * `mod` is Cmd on macOS and Ctrl elsewhere, so a config writing `cmd+v` is
 * asking for Paste on a Mac just as surely as `mod+v` is. Reserving the
 * explicit forms alongside the portable one errs toward refusing a chord that
 * might be safe, rather than handing away Paste on one platform out of two.
 */
const RESERVED_SET = new Set(
  RESERVED_CHORDS.flatMap((text) => {
    const canonical = canonicalChord(text);
    if (canonical === null) return [];
    return canonical.includes("mod+")
      ? [canonical, canonical.replace("mod+", "meta+"), canonical.replace("mod+", "ctrl+")]
      : [canonical];
  }),
);

/**
 * Whether a chord is spoken for.
 *
 * Canonicalises first, so `"MOD+V"`, `"cmd+v"` and `"mod+v"` are all recognised
 * as the same reserved keystroke rather than only the spelling in the list.
 */
export const isReservedChord = (text: string): boolean => {
  const canonical = canonicalChord(text);
  return canonical !== null && RESERVED_SET.has(canonical);
};
