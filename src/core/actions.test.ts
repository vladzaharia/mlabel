import { describe, expect, it } from "vitest";
import { buildConfig } from "@test/fixtures/config";
import {
  BUILTIN_ACTIONS,
  canFire,
  configBindingsOf,
  findChordConflicts,
  overrideKey,
  resolveBindings,
  type GuardContext,
} from "./actions";
import { parseChord } from "./shortcuts";

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  typing: false,
  textEntry: false,
  defaultPrevented: false,
  enterTaken: false,
  spaceTaken: false,
  composing: false,
  ...over,
});

const chord = (text: string) => parseChord(text)!;

// Each case below pins one behaviour the hand-written if-chain had before the
// registry replaced it. They are the regression contract for that refactor.
describe("canFire — always", () => {
  it("fires a modifier chord from inside a text field", () => {
    // ⌘Enter has to export while the caret is in the notes box.
    expect(canFire("always", chord("mod+enter"), ctx({ textEntry: true, typing: true }))).toBe(
      true,
    );
  });

  it("holds back a bare chord while text is being entered", () => {
    expect(canFire("always", chord("c"), ctx({ textEntry: true }))).toBe(false);
  });

  it("still fires a bare chord when a widget has focus but letters are free", () => {
    // A slider or radio group consumes arrows, not letters. This is what makes
    // a choice chord usable from anywhere in the form.
    expect(canFire("always", chord("c"), ctx({ typing: true, textEntry: false }))).toBe(true);
  });

  it("yields a bare chord to a widget that already consumed the key", () => {
    expect(canFire("always", chord("c"), ctx({ defaultPrevented: true }))).toBe(false);
  });
});

describe("canFire — idle", () => {
  it("does not fire while any keystroke-consuming widget has focus", () => {
    expect(canFire("idle", chord("right"), ctx({ typing: true }))).toBe(false);
  });

  it("does not fire once something has consumed the key", () => {
    expect(canFire("idle", chord("right"), ctx({ defaultPrevented: true }))).toBe(false);
  });

  it("fires when nothing has a claim on the keyboard", () => {
    expect(canFire("idle", chord("right"), ctx())).toBe(true);
  });
});

describe("canFire — key-free", () => {
  it("does not advance on Enter where Enter already activates something", () => {
    expect(canFire("key-free", chord("enter"), ctx({ enterTaken: true }))).toBe(false);
  });

  it("does not advance on Enter while an IME is composing", () => {
    expect(canFire("key-free", chord("enter"), ctx({ composing: true }))).toBe(false);
  });

  it("does not advance on Space where Space already activates something", () => {
    expect(canFire("key-free", chord("space"), ctx({ spaceTaken: true }))).toBe(false);
  });

  // The two keys have different claims: a link scrolls on Space but activates
  // on Enter, so one guard must not stand in for the other.
  it("keeps the Enter and Space claims separate", () => {
    expect(canFire("key-free", chord("space"), ctx({ enterTaken: true }))).toBe(true);
    expect(canFire("key-free", chord("enter"), ctx({ spaceTaken: true }))).toBe(true);
  });

  // The check is derived from the chord, so rebinding the action to a letter
  // drops the Enter-is-taken question entirely.
  it("applies neither claim once the action is bound to an ordinary key", () => {
    expect(canFire("key-free", chord("n"), ctx({ enterTaken: true, spaceTaken: true }))).toBe(true);
  });
});

describe("BUILTIN_ACTIONS", () => {
  // Every row is shown to a person and named for assistive tech, so two rows
  // that read the same are genuinely ambiguous, not just awkward.
  it("describes every action distinctly", () => {
    const seen = BUILTIN_ACTIONS.map((a) => a.description);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("gives every action a chord the parser accepts", () => {
    for (const action of BUILTIN_ACTIONS) {
      for (const text of action.defaultChords) {
        expect(parseChord(text), `${action.id}: ${text}`).not.toBeNull();
      }
    }
  });

  it("orders the app-wide export ahead of everything else", () => {
    // ⌘Enter is matched first in the old if-chain, and config chords beat the
    // built-ins. Encoded explicitly so it cannot drift with array order.
    const done = BUILTIN_ACTIONS.find((a) => a.id === "app.done")!;
    for (const other of BUILTIN_ACTIONS) {
      if (other.id !== "app.done") expect(done.order).toBeLessThan(other.order);
    }
  });

  // Arrows must keep scrolling the input pane while they also move the record,
  // and `?` must not swallow the keystroke.
  it("does not preventDefault for the actions that must not swallow the key", () => {
    for (const id of ["nav.next", "nav.prev", "app.help"] as const) {
      expect(BUILTIN_ACTIONS.find((a) => a.id === id)?.preventDefault).toBe(false);
    }
    expect(BUILTIN_ACTIONS.find((a) => a.id === "record.advance")?.preventDefault).toBe(true);
    expect(BUILTIN_ACTIONS.find((a) => a.id === "app.done")?.preventDefault).toBe(true);
  });

  it("marks the native-menu actions as owned elsewhere", () => {
    for (const id of ["app.settings", "app.modeLabel", "app.modePrepare"] as const) {
      const action = BUILTIN_ACTIONS.find((a) => a.id === id)!;
      expect(action.nativeMenu).toBe(true);
      expect(action.remappable).toBe(false);
    }
  });
});

const config = buildConfig({
  output: [
    { name: "verdict", kind: "choice", choices: ["good", "bad"] },
    { name: "note" },
    { name: "id", kind: "copied" },
  ],
  input: ["id"],
});

const withShortcuts = buildConfig({
  output: [
    {
      name: "verdict",
      kind: "choice",
      choices: [
        { value: "good", label: "Looks good", shortcut: "g" },
        { value: "bad", shortcut: "b" },
      ],
    },
    { name: "note" },
  ],
});

describe("configBindingsOf", () => {
  it("is empty without a config", () => {
    expect(configBindingsOf(null)).toEqual([]);
  });

  it("offers one binding per choice", () => {
    const ids = configBindingsOf(config).map((b) => b.id);
    expect(ids).toContain("choice:verdict/good");
    expect(ids).toContain("choice:verdict/bad");
  });

  // A field is already reachable by Tab and by clicking, so an unrequested
  // "Focus this field" row is a binding nobody asked for — offered once per
  // field, it buries the choice keys that are the actual point.
  it("offers no focus binding for a field that did not ask for one", () => {
    const ids = configBindingsOf(config).map((b) => b.id);
    expect(ids).not.toContain("field:verdict");
    expect(ids).not.toContain("field:note");
  });

  it("skips fields the app fills for itself", () => {
    expect(configBindingsOf(config).map((b) => b.id)).not.toContain("field:id");
  });

  it("carries the chords the config declared as the defaults", () => {
    const bindings = configBindingsOf(withShortcuts);
    expect(bindings.find((b) => b.id === "choice:verdict/good")?.defaultChords).toEqual(["g"]);
    expect(bindings.find((b) => b.id === "choice:verdict/bad")?.defaultChords).toEqual(["b"]);
  });

  // The one case a focus binding is worth offering: the author asked for it,
  // usually to jump to a notes box that no choice key can reach.
  it("keeps a focus binding the config declared itself", () => {
    const withFieldChord = buildConfig({
      output: [{ name: "note", shortcut: "mod+n" }],
    });
    const binding = configBindingsOf(withFieldChord).find((b) => b.id === "field:note");
    expect(binding?.defaultChords).toEqual(["mod+n"]);
  });

  it("describes a choice by its caption, not its stored value", () => {
    const good = configBindingsOf(withShortcuts).find((b) => b.id === "choice:verdict/good");
    expect(good?.description).toContain("Looks good");
  });
});

describe("overrideKey", () => {
  it("leaves a built-in action global", () => {
    expect(overrideKey("nav.next", "/a/config.jsonc")).toBe("nav.next");
    expect(overrideKey("nav.next", null)).toBe("nav.next");
  });

  // Two configs may each have a `verdict` field meaning different things, so a
  // rebinding in one must not follow the labeler into the other.
  it("scopes a config binding to the config it came from", () => {
    expect(overrideKey("choice:verdict/good", "/a.jsonc")).not.toBe(
      overrideKey("choice:verdict/good", "/b.jsonc"),
    );
  });
});

describe("resolveBindings", () => {
  it("falls back to the defaults when nothing is overridden", () => {
    const next = resolveBindings(null, null, {}).find((b) => b.id === "nav.next")!;
    expect(next.chords).toEqual(["right"]);
    expect(next.isDefault).toBe(true);
  });

  it("replaces a default rather than adding to it", () => {
    const next = resolveBindings(null, null, { "nav.next": ["n"] }).find(
      (b) => b.id === "nav.next",
    )!;
    expect(next.chords).toEqual(["n"]);
    expect(next.isDefault).toBe(false);
  });

  // Distinct from "absent": the labeler deliberately took the key away.
  it("treats an empty override as unbound", () => {
    const help = resolveBindings(null, null, { "app.help": [] }).find((b) => b.id === "app.help")!;
    expect(help.chords).toEqual([]);
    expect(help.isDefault).toBe(false);
  });

  it("includes the config's own bindings, keyed per config", () => {
    const bindings = resolveBindings(withShortcuts, "/a.jsonc", {
      "/a.jsonc::choice:verdict/good": ["k"],
    });
    const good = bindings.find((b) => b.id === "choice:verdict/good")!;
    expect(good.chords).toEqual(["k"]);
    expect(good.storageKey).toBe("/a.jsonc::choice:verdict/good");
  });

  it("ignores an override belonging to a different config", () => {
    const bindings = resolveBindings(withShortcuts, "/a.jsonc", {
      "/b.jsonc::choice:verdict/good": ["k"],
    });
    expect(bindings.find((b) => b.id === "choice:verdict/good")?.chords).toEqual(["g"]);
  });

  it("orders app.done ahead of config bindings, and those ahead of the rest", () => {
    const bindings = resolveBindings(withShortcuts, "/a.jsonc", {});
    const orderOf = (id: string): number => bindings.find((b) => b.id === id)!.order;
    expect(orderOf("app.done")).toBeLessThan(orderOf("choice:verdict/good"));
    expect(orderOf("choice:verdict/good")).toBeLessThan(orderOf("nav.next"));
  });
});

describe("findChordConflicts", () => {
  it("is quiet when every chord is distinct", () => {
    expect(findChordConflicts(resolveBindings(withShortcuts, "/a.jsonc", {}))).toEqual([]);
  });

  it("reports a config chord colliding with a built-in", () => {
    const bindings = resolveBindings(withShortcuts, "/a.jsonc", { "nav.next": ["g"] });
    const found = findChordConflicts(bindings);
    expect(found).toHaveLength(1);
    expect(found[0]?.chord).toBe("g");
    expect(found[0]?.bindingIds).toEqual(
      expect.arrayContaining(["nav.next", "choice:verdict/good"]),
    );
  });

  it("sees a collision through a different spelling of the same chord", () => {
    const bindings = resolveBindings(null, null, {
      "nav.next": ["mod+shift+k"],
      "nav.prev": ["shift+mod+K"],
    });
    expect(findChordConflicts(bindings)).toHaveLength(1);
  });

  it("flags a reserved chord even when nothing else claims it", () => {
    const bindings = resolveBindings(null, null, { "nav.next": ["mod+v"] });
    const found = findChordConflicts(bindings);
    expect(found).toHaveLength(1);
    expect(found[0]?.reserved).toBe(true);
  });

  it("does not count an unbound action as a collision", () => {
    const bindings = resolveBindings(null, null, { "nav.next": [], "nav.prev": [] });
    expect(findChordConflicts(bindings)).toEqual([]);
  });
});
