import { describe, expect, it } from "vitest";
import { test, fc } from "@fast-check/vitest";
import {
  ariaChord,
  canonicalChord,
  chordFromEvent,
  chordMatches,
  formatChord,
  isBareChord,
  isReservedChord,
  NAMED_KEYS,
  parseChord,
  RESERVED_CHORDS,
} from "./shortcuts";

const event = (
  key: string,
  mods: Partial<Record<"meta" | "ctrl" | "alt" | "shift", boolean>> = {},
) => ({
  key,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe("parseChord", () => {
  it("parses a bare key", () => {
    expect(parseChord("p")).toMatchObject({ key: "p", mod: false, shift: false });
  });

  it("lowercases the key so a config may write either case", () => {
    expect(parseChord("P")?.key).toBe("p");
  });

  it("parses modifiers in any order", () => {
    expect(parseChord("shift+mod+s")).toMatchObject({ key: "s", mod: true, shift: true });
  });

  it("rejects an unknown modifier", () => {
    expect(parseChord("hyper+s")).toBeNull();
  });

  it("accepts cmd and opt as aliases for the Mac names", () => {
    expect(parseChord("cmd+s")).toMatchObject({ key: "s", meta: true });
    expect(parseChord("opt+s")).toMatchObject({ key: "s", alt: true });
  });

  it("parses every named key", () => {
    for (const named of NAMED_KEYS) {
      expect(parseChord(named.token)).toMatchObject({ key: named.key });
    }
  });

  // This used to be `rejects a multi-character key`. Named keys are the whole
  // point of the grammar now — without them Space, Enter and the arrows could
  // not be bound to anything at all.
  it("parses a named key behind a modifier", () => {
    expect(parseChord("mod+enter")).toMatchObject({ key: "enter", mod: true });
  });

  it("accepts common aliases for named keys", () => {
    expect(parseChord("esc")?.key).toBe("escape");
    expect(parseChord("return")?.key).toBe("enter");
    expect(parseChord("arrowleft")?.key).toBe("arrowleft");
  });

  it("still rejects a word that is not a named key", () => {
    expect(parseChord("banana")).toBeNull();
    expect(parseChord("mod+banana")).toBeNull();
    expect(parseChord("ctrl+")).toBeNull();
  });
});

describe("isBareChord", () => {
  it("is true for a plain keystroke", () => {
    expect(isBareChord(parseChord("c")!)).toBe(true);
  });

  it("is false once any modifier is required", () => {
    for (const text of ["mod+c", "shift+c", "alt+c", "ctrl+c", "meta+c"]) {
      expect(isBareChord(parseChord(text)!)).toBe(false);
    }
  });
});

describe("chordMatches", () => {
  it("resolves mod to Cmd on macOS and Ctrl elsewhere", () => {
    const chord = parseChord("mod+s")!;
    expect(chordMatches(chord, event("s", { meta: true }), true)).toBe(true);
    expect(chordMatches(chord, event("s", { ctrl: true }), false)).toBe(true);
  });

  it("does not fire a bare key while a modifier is held", () => {
    const chord = parseChord("p")!;
    expect(chordMatches(chord, event("p"), true)).toBe(true);
    expect(chordMatches(chord, event("p", { meta: true }), true)).toBe(false);
  });

  it("matches the named keys against the values a keydown actually carries", () => {
    expect(chordMatches(parseChord("space")!, event(" "), true)).toBe(true);
    expect(chordMatches(parseChord("enter")!, event("Enter"), true)).toBe(true);
    expect(chordMatches(parseChord("left")!, event("ArrowLeft"), true)).toBe(true);
    expect(chordMatches(parseChord("escape")!, event("Escape"), true)).toBe(true);
  });

  it("still distinguishes a shifted named key", () => {
    expect(chordMatches(parseChord("shift+left")!, event("ArrowLeft", { shift: true }), true)).toBe(
      true,
    );
    expect(chordMatches(parseChord("shift+left")!, event("ArrowLeft"), true)).toBe(false);
    expect(chordMatches(parseChord("left")!, event("ArrowLeft", { shift: true }), true)).toBe(
      false,
    );
  });

  // `?` is Shift+/ on nearly every layout, so the browser reports shiftKey true
  // for a chord written without one. For punctuation the character already
  // encodes the shift state, so comparing it again would make `?` unmatchable.
  it("ignores the shift state for punctuation, which already encodes it", () => {
    expect(chordMatches(parseChord("?")!, event("?", { shift: true }), true)).toBe(true);
    expect(chordMatches(parseChord("?")!, event("?"), true)).toBe(true);
  });

  it("still requires shift where the key does not encode it", () => {
    expect(chordMatches(parseChord("c")!, event("c", { shift: true }), true)).toBe(false);
    expect(chordMatches(parseChord("space")!, event(" ", { shift: true }), true)).toBe(false);
  });
});

describe("canonicalChord", () => {
  it("puts modifiers in a fixed order", () => {
    expect(canonicalChord("shift+mod+S")).toBe("mod+shift+s");
    expect(canonicalChord("mod+shift+s")).toBe("mod+shift+s");
  });

  it("folds aliases onto their canonical token", () => {
    expect(canonicalChord("Esc")).toBe("escape");
    expect(canonicalChord("ArrowLeft")).toBe("left");
    expect(canonicalChord("cmd+s")).toBe("meta+s");
    expect(canonicalChord("opt+s")).toBe("alt+s");
  });

  it("returns null for anything unparseable", () => {
    expect(canonicalChord("banana")).toBeNull();
  });
});

describe("chordFromEvent", () => {
  it("builds the text form of a keystroke", () => {
    expect(chordFromEvent(event("s", { meta: true }), true)).toBe("mod+s");
    expect(chordFromEvent(event("s", { ctrl: true }), false)).toBe("mod+s");
    expect(chordFromEvent(event("c"), true)).toBe("c");
  });

  it("names the platform modifier `mod`, so a recorded chord travels", () => {
    // Recorded on a Mac, it must still mean Ctrl on Windows.
    expect(chordFromEvent(event("k", { meta: true }), true)).toBe("mod+k");
  });

  it("uses the canonical token for a named key", () => {
    expect(chordFromEvent(event("ArrowRight", { shift: true }), true)).toBe("shift+right");
    expect(chordFromEvent(event(" "), true)).toBe("space");
  });

  it("returns null while only modifiers are held", () => {
    for (const key of ["Shift", "Meta", "Control", "Alt", "Dead"]) {
      expect(chordFromEvent(event(key, { shift: true }), true)).toBeNull();
    }
  });

  test.prop([
    fc.constantFrom("c", "k", "1", "space", "enter", "left", "escape"),
    fc.constantFrom("", "mod+", "shift+", "mod+shift+", "alt+"),
  ])("round-trips through parseChord", (key, mods) => {
    const text = `${mods}${key}`;
    const chord = parseChord(text)!;
    expect(chord).not.toBeNull();
    const replayed = chordFromEvent(
      {
        // `Chord.key` already holds what a real keydown carries — `" "` for
        // Space, `"arrowleft"` for the left arrow.
        key: chord.key,
        metaKey: chord.meta || chord.mod,
        ctrlKey: chord.ctrl,
        altKey: chord.alt,
        shiftKey: chord.shift,
      },
      true,
    );
    expect(canonicalChord(replayed!)).toBe(canonicalChord(text));
  });
});

describe("formatChord", () => {
  it("uses glyphs on macOS and words elsewhere", () => {
    expect(formatChord("mod+shift+s", true)).toBe("⌘⇧S");
    expect(formatChord("mod+shift+s", false)).toBe("Ctrl+Shift+S");
  });

  it("gives a named key its own glyph or word", () => {
    expect(formatChord("mod+enter", true)).toBe("⌘⏎");
    expect(formatChord("space", false)).toBe("Space");
    expect(formatChord("shift+left", true)).toBe("⇧←");
  });
});

describe("ariaChord", () => {
  // aria-keyshortcuts is spelled with KeyboardEvent modifier names, not glyphs —
  // "⌘V" is meaningless to a screen reader, "Meta+V" is not.
  it("spells a bare key as the uppercase character", () => {
    expect(ariaChord("c", true)).toBe("C");
  });

  it("resolves mod to the platform modifier under its ARIA name", () => {
    expect(ariaChord("mod+v", true)).toBe("Meta+V");
    expect(ariaChord("mod+v", false)).toBe("Control+V");
  });

  it("spells ctrl as Control rather than Ctrl", () => {
    expect(ariaChord("ctrl+p", true)).toBe("Control+P");
  });

  it("keeps digits as written", () => {
    expect(ariaChord("shift+1", true)).toBe("Shift+1");
  });

  it("preserves the order the config wrote the modifiers in", () => {
    expect(ariaChord("mod+shift+l", false)).toBe("Control+Shift+L");
  });

  it("uses the WAI-ARIA name for a named key", () => {
    expect(ariaChord("space", true)).toBe("Space");
    expect(ariaChord("mod+enter", true)).toBe("Meta+Enter");
    expect(ariaChord("shift+left", true)).toBe("Shift+ArrowLeft");
  });
});

describe("RESERVED_CHORDS", () => {
  it("covers the clipboard chords, which a config must never be able to steal", () => {
    for (const chord of ["mod+x", "mod+c", "mod+v", "mod+a"]) {
      expect(isReservedChord(chord)).toBe(true);
    }
  });

  it("covers the keys the app itself drives", () => {
    for (const chord of ["enter", "space", "left", "right", "shift+left", "shift+right", "mod+,"]) {
      expect(isReservedChord(chord)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedChord("MOD+V")).toBe(true);
  });

  // Reserved-ness is about the keystroke, not about how it was spelled.
  it("sees through an alias for the same keystroke", () => {
    expect(isReservedChord("return")).toBe(true);
    // `cmd+v` and `ctrl+v` each *are* Paste on one platform, so reserving
    // `mod+v` has to cover them too.
    expect(isReservedChord("cmd+v")).toBe(true);
    expect(isReservedChord("ctrl+v")).toBe(true);
  });

  it("does not over-reserve a chord that merely adds a modifier", () => {
    expect(isReservedChord("shift+mod+v")).toBe(false);
    expect(isReservedChord("alt+enter")).toBe(false);
  });

  it("does not reserve an ordinary letter", () => {
    expect(isReservedChord("p")).toBe(false);
  });

  it("lists every chord in a form parseChord accepts", () => {
    for (const chord of RESERVED_CHORDS) {
      expect(parseChord(chord), chord).not.toBeNull();
    }
  });
});
