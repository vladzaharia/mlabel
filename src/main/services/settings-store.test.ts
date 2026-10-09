import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, pruneShortcuts, sanitizeSettings } from "./settings-store";

describe("sanitizeSettings — nothing readable", () => {
  it("falls back to the defaults for anything that is not an object", () => {
    for (const bad of [undefined, null, [], "x", 42, true]) {
      expect(sanitizeSettings(bad)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it("returns a fresh object each time, never an alias of the input", () => {
    const input = { ...DEFAULT_SETTINGS };
    const result = sanitizeSettings(input);
    expect(result).not.toBe(input);
    expect(result.shortcuts).not.toBe(input.shortcuts);
  });
});

// Deliberately more forgiving than `session.json`, which is discarded outright
// on a version mismatch. A misread session is data loss; a misread preference
// is an inconvenience, so salvage field by field rather than wiping the lot.
describe("sanitizeSettings — salvage", () => {
  it("keeps the fields it understands and defaults the ones it does not", () => {
    const result = sanitizeSettings({ themeMode: "dark", colorTheme: "nonsense" });
    expect(result.themeMode).toBe("dark");
    expect(result.colorTheme).toBe(DEFAULT_SETTINGS.colorTheme);
  });

  it("defaults an unknown theme mode", () => {
    expect(sanitizeSettings({ themeMode: "sepia" }).themeMode).toBe("system");
  });

  it("salvages rather than wipes when the version is from the future", () => {
    expect(sanitizeSettings({ version: 99, themeMode: "light" }).themeMode).toBe("light");
  });

  it("coerces a non-boolean updateChecks to the permissive default", () => {
    expect(sanitizeSettings({ updateChecks: "yes" }).updateChecks).toBe(true);
    expect(sanitizeSettings({ updateChecks: false }).updateChecks).toBe(false);
  });
});

const shortcutsIn = (shortcuts: unknown): Record<string, string[]> =>
  sanitizeSettings({ shortcuts }).shortcuts;

describe("sanitizeSettings — shortcuts", () => {
  it("keeps a well-formed override", () => {
    expect(shortcutsIn({ "nav.next": ["n"] })).toEqual({ "nav.next": ["n"] });
  });

  // Unbound is a legitimate choice, and distinct from absent.
  it("keeps an empty override, which means deliberately unbound", () => {
    expect(shortcutsIn({ "nav.next": [] })).toEqual({ "nav.next": [] });
  });

  it("drops an entry whose value is not a list of strings", () => {
    expect(shortcutsIn({ a: "n", b: [1], c: null })).toEqual({});
  });

  it("drops a chord the parser cannot read", () => {
    expect(shortcutsIn({ "nav.next": ["banana"] })).toEqual({});
  });

  // A hand-edited file must not be able to take Paste away from the notes box.
  it("drops a chord the app or the OS owns", () => {
    expect(shortcutsIn({ "nav.next": ["mod+v"] })).toEqual({});
    expect(shortcutsIn({ "nav.next": ["mod+q"] })).toEqual({});
  });

  it("drops only the bad chords from an otherwise valid entry", () => {
    expect(shortcutsIn({ "nav.next": ["n", "banana"] })).toEqual({ "nav.next": ["n"] });
  });

  it("drops an entry whose key is not a non-empty string", () => {
    expect(shortcutsIn({ "": ["n"] })).toEqual({});
  });

  it("ignores a shortcuts value that is not an object at all", () => {
    expect(shortcutsIn("nope")).toEqual({});
    expect(shortcutsIn([])).toEqual({});
  });
});

// Config-scoped overrides are keyed by path, so they accumulate forever as a
// labeler moves between projects unless something clears the dead ones out.
const exists = (path: string): boolean => path === "/live.jsonc";

describe("pruneShortcuts", () => {
  it("keeps global bindings, which belong to no config", () => {
    expect(pruneShortcuts({ "nav.next": ["n"] }, exists)).toEqual({ "nav.next": ["n"] });
  });

  it("keeps a binding whose config is still on disk", () => {
    const kept = { "/live.jsonc::choice:v/good": ["g"] };
    expect(pruneShortcuts(kept, exists)).toEqual(kept);
  });

  it("drops a binding whose config is gone", () => {
    expect(pruneShortcuts({ "/gone.jsonc::choice:v/good": ["g"] }, exists)).toEqual({});
  });

  it("keeps a Windows path containing a drive colon", () => {
    // `C:\work\a.jsonc::choice:v/good` — the separator is `::`, and splitting
    // on a single colon would mangle every Windows path there is.
    const kept = { "C:\\work\\a.jsonc::choice:v/good": ["g"] };
    expect(pruneShortcuts(kept, (p) => p === "C:\\work\\a.jsonc")).toEqual(kept);
  });
});
