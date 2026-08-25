import { describe, expect, it } from "vitest";
import {
  ariaChord,
  chordMatches,
  formatChord,
  isBareChord,
  isReservedChord,
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

  it("rejects a multi-character key", () => {
    expect(parseChord("mod+enter")).toBeNull();
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
});

describe("formatChord", () => {
  it("uses glyphs on macOS and words elsewhere", () => {
    expect(formatChord("mod+shift+s", true)).toBe("⌘⇧S");
    expect(formatChord("mod+shift+s", false)).toBe("Ctrl+Shift+S");
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
});

describe("RESERVED_CHORDS", () => {
  it("covers the clipboard chords, which a config must never be able to steal", () => {
    for (const chord of ["mod+x", "mod+c", "mod+v", "mod+a"]) {
      expect(isReservedChord(chord)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedChord("MOD+V")).toBe(true);
  });

  it("does not reserve an ordinary letter", () => {
    expect(isReservedChord("p")).toBe(false);
  });

  it("lists every chord in a parseable form or as a known named key", () => {
    for (const chord of RESERVED_CHORDS) {
      const key = chord.split("+").pop()!;
      expect(key.length === 1 || key === "enter").toBe(true);
    }
  });
});
