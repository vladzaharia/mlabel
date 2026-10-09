import { isUserFilled } from "./automapping";
import type { AppConfig, OutputField } from "./config";
import { titleOf } from "./config";
import { canonicalChord, isBareChord, isReservedChord, type Chord } from "./shortcuts";

/**
 * What the keyboard can do, as data.
 *
 * The renderer used to carry this as one ordered if-chain, which meant the
 * guards, the dispatch order and the list of things a labeler could rebind all
 * lived inside a DOM event handler and could only be tested through one. Here
 * they are a table and one pure predicate, so the settings pane, the help
 * dialog and the on-screen hints can all read the same answer, and the whole
 * thing unit-tests without a DOM.
 *
 * This module knows nothing about how an action is *performed* — the renderer
 * supplies that. It only says what exists, what it is called, what may fire it,
 * and when.
 */

export type ActionId =
  | "nav.next"
  | "nav.prev"
  | "nav.nextIncomplete"
  | "nav.prevIncomplete"
  | "record.advance"
  | "record.pickNth"
  | "app.done"
  | "app.help"
  | "app.settings"
  | "app.modeLabel"
  | "app.modePrepare";

/** How bindings are grouped for the help dialog and the settings list. */
export type BindingGroup = "navigation" | "record" | "application" | "config";

/**
 * Where a keystroke is allowed to fire.
 *
 * - `always` — fires even inside a text field, provided the chord carries a
 *   modifier. A bare chord is still held back, because a letter typed into the
 *   notes box has to stay a letter.
 * - `idle` — additionally blocked while any keystroke-consuming widget has
 *   focus, or once something has already consumed the key.
 * - `key-free` — `idle`, plus: the chord's own key must not already mean
 *   something on the focused element. Which check applies is derived from the
 *   chord, so rebinding "next record" from Enter to `n` drops the question.
 */
export type GuardKind = "always" | "idle" | "key-free";

export interface ActionDef {
  id: ActionId;
  group: BindingGroup;
  /** Imperative phrase, shown in the help dialog and the settings list. */
  description: string;
  /** In priority order. The first is what on-screen hints render. */
  defaultChords: readonly string[];
  guard: GuardKind;
  /** False for fixed bindings the settings pane lists but will not rebind. */
  remappable: boolean;
  /**
   * The native menu owns this keystroke — main handles it as an Electron
   * accelerator. Listed so it is discoverable; never matched in the renderer.
   */
  nativeMenu?: boolean;
  /**
   * Whether a match consumes the keystroke.
   *
   * Not a detail: the arrows must keep scrolling the input pane while they also
   * move through records, so making every match `preventDefault` would silently
   * break scrolling for anyone navigating by keyboard.
   */
  preventDefault: boolean;
  /**
   * Dispatch order, low first.
   *
   * Explicit rather than array position, because the ordering is load-bearing
   * and invisible: export beats the config's own chords, which beat the
   * built-ins. Anyone reordering the literal below should not change behaviour.
   */
  order: number;
}

/** Where config-declared chords sit in the dispatch order. */
const CONFIG_ORDER = 10;

export const BUILTIN_ACTIONS: readonly ActionDef[] = [
  {
    id: "app.done",
    group: "application",
    description: "Save & export",
    defaultChords: ["mod+enter"],
    guard: "always",
    remappable: true,
    preventDefault: true,
    order: 0,
  },
  {
    id: "record.advance",
    group: "record",
    // Distinct from `nav.next`, which does the same thing: these are two
    // separate bindings with different guards, and two rows reading "Next
    // record" would be ambiguous in the help dialog and in settings alike.
    description: "Move on from this record",
    defaultChords: ["enter", "space"],
    guard: "key-free",
    remappable: true,
    preventDefault: true,
    order: 20,
  },
  {
    id: "nav.next",
    group: "navigation",
    description: "Next record",
    defaultChords: ["right"],
    guard: "idle",
    remappable: true,
    preventDefault: false,
    order: 21,
  },
  {
    id: "nav.prev",
    group: "navigation",
    description: "Previous record",
    defaultChords: ["left"],
    guard: "idle",
    remappable: true,
    preventDefault: false,
    order: 22,
  },
  {
    id: "nav.nextIncomplete",
    group: "navigation",
    description: "Next unfinished record",
    defaultChords: ["shift+right"],
    guard: "idle",
    remappable: true,
    preventDefault: false,
    order: 23,
  },
  {
    id: "nav.prevIncomplete",
    group: "navigation",
    description: "Previous unfinished record",
    defaultChords: ["shift+left"],
    guard: "idle",
    remappable: true,
    preventDefault: false,
    order: 24,
  },
  {
    id: "app.help",
    group: "application",
    description: "Keyboard shortcuts",
    defaultChords: ["?"],
    guard: "idle",
    remappable: true,
    preventDefault: false,
    order: 25,
  },
  {
    // One behaviour, not nine bindings: the digits pick the *nth* option, which
    // is positional. Rebinding "the fourth choice" to a letter is incoherent.
    id: "record.pickNth",
    group: "record",
    description: "Number keys pick choices",
    defaultChords: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    guard: "idle",
    remappable: false,
    preventDefault: false,
    order: 30,
  },
  {
    id: "app.settings",
    group: "application",
    description: "Settings",
    defaultChords: ["mod+,"],
    guard: "always",
    remappable: false,
    nativeMenu: true,
    preventDefault: false,
    order: 40,
  },
  {
    id: "app.modeLabel",
    group: "application",
    description: "Switch to labeling",
    defaultChords: ["mod+shift+l"],
    guard: "always",
    remappable: false,
    nativeMenu: true,
    preventDefault: false,
    order: 41,
  },
  {
    id: "app.modePrepare",
    group: "application",
    description: "Switch to preparing data",
    defaultChords: ["mod+shift+p"],
    guard: "always",
    remappable: false,
    nativeMenu: true,
    preventDefault: false,
    order: 42,
  },
];

/** Everything about the moment a key went down that a guard needs to know. */
export interface GuardContext {
  /** A keystroke-consuming widget has focus: text entry, slider, radio, select. */
  typing: boolean;
  /** Narrower: somewhere a *letter* is literal text or drives typeahead. */
  textEntry: boolean;
  /** Something has already consumed this keystroke. */
  defaultPrevented: boolean;
  /** Focus is on an element where Enter already activates something. */
  enterTaken: boolean;
  /** Focus is on an element where Space already activates something. */
  spaceTaken: boolean;
  /** An IME is mid-composition, so this Enter is committing text. */
  composing: boolean;
}

const ENTER_KEY = "enter";
const SPACE_KEY = " ";

/** Whether a chord may fire under this guard, right now. Pure. */
export function canFire(guard: GuardKind, chord: Chord, ctx: GuardContext): boolean {
  if (isBareChord(chord) && (ctx.textEntry || ctx.defaultPrevented)) return false;
  if (guard === "always") return true;

  if (ctx.typing || ctx.defaultPrevented) return false;
  if (guard === "idle") return true;

  if (chord.key === ENTER_KEY && (ctx.enterTaken || ctx.composing)) return false;
  if (chord.key === SPACE_KEY && ctx.spaceTaken) return false;
  return true;
}

/** What a config chord does when it fires. */
export type ConfigBindingKind = "focus-field" | "pick-choice" | "toggle-choice";

/** A binding the loaded config brought with it. */
export interface ConfigBinding {
  /** `field:<name>` or `choice:<field>/<choice>`. */
  id: string;
  kind: ConfigBindingKind;
  field: string;
  choice?: string;
  description: string;
  /** The group heading, which for config bindings is the field's caption. */
  group: string;
  defaultChords: readonly string[];
}

/** The choices a field offers, and whether picking one replaces or toggles. */
function choicesOf(field: OutputField):
  | {
      list: readonly { name: string; display?: { title?: string }; shortcut?: string }[];
      kind: ConfigBindingKind;
    }
  | undefined {
  if (field.type === "enum") return { list: field.choices, kind: "pick-choice" };
  if (field.type === "array" && field.items.type === "enum") {
    return { list: field.items.choices, kind: "toggle-choice" };
  }
  return undefined;
}

/**
 * The bindings a config declares: one per choice of every field that offers
 * choices, plus a focus binding for any field whose author asked for one.
 *
 * Choices are listed whether or not they carry a chord, because binding one is
 * the common thing a labeler wants and the settings pane needs a row to attach
 * it to. **Focus is not**, and the asymmetry is deliberate: a field is already
 * reachable by Tab and by clicking, so an unrequested "Focus this field" row is
 * a binding nobody asked for, offered for every field, burying the choice keys
 * that are the actual point. A config that declares `shortcut` on a field —
 * jumping to a notes textarea, say — still gets its row.
 */
export function configBindingsOf(config: AppConfig | null): ConfigBinding[] {
  if (!config) return [];
  const out: ConfigBinding[] = [];

  for (const field of config.output.fields) {
    if (!isUserFilled(field)) continue;
    const caption = titleOf(field.name, field.display);

    if (field.shortcut !== undefined) {
      out.push({
        id: `field:${field.name}`,
        kind: "focus-field",
        field: field.name,
        description: "Focus this field",
        group: caption,
        defaultChords: [field.shortcut],
      });
    }

    const choices = choicesOf(field);
    if (!choices) continue;
    for (const choice of choices.list) {
      out.push({
        id: `choice:${field.name}/${choice.name}`,
        kind: choices.kind,
        field: field.name,
        choice: choice.name,
        description: `Choose “${titleOf(choice.name, choice.display)}”`,
        group: caption,
        defaultChords: choice.shortcut === undefined ? [] : [choice.shortcut],
      });
    }
  }
  return out;
}

/**
 * A labeler's chord overrides.
 *
 * Keyed by {@link overrideKey}. An empty array means *deliberately unbound*,
 * which is a different thing from an absent key meaning *use the default*.
 */
export type ShortcutOverrides = Record<string, readonly string[]>;

/**
 * Where a binding's override is stored.
 *
 * Built-in actions are global — "next record" means the same thing whatever
 * file is open. A config's own bindings are scoped to the config, because two
 * projects may both have a `verdict` field meaning quite different things, and
 * a rebinding in one should not follow the labeler into the other.
 */
export function overrideKey(bindingId: string, configPath: string | null): string {
  const isBuiltin = BUILTIN_ACTIONS.some((a) => a.id === bindingId);
  if (isBuiltin || configPath === null) return bindingId;
  return `${configPath}::${bindingId}`;
}

/** A binding with its override applied, ready to dispatch or display. */
export interface ResolvedBinding {
  id: string;
  storageKey: string;
  group: BindingGroup | string;
  description: string;
  /** The override if there is one, else the default. */
  chords: readonly string[];
  defaultChords: readonly string[];
  isDefault: boolean;
  remappable: boolean;
  nativeMenu: boolean;
  guard: GuardKind;
  preventDefault: boolean;
  order: number;
  kind?: ConfigBindingKind;
  field?: string;
  choice?: string;
}

const sameChords = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((text, i) => text === b[i]);

/**
 * Every binding in force, built-ins and the config's own, with overrides
 * applied and in dispatch order.
 *
 * `actions` is injectable so a test can drive resolution with a small table
 * rather than the whole app's.
 */
export function resolveBindings(
  config: AppConfig | null,
  configPath: string | null,
  overrides: ShortcutOverrides,
  actions: readonly ActionDef[] = BUILTIN_ACTIONS,
): ResolvedBinding[] {
  const resolve = (
    id: string,
    defaults: readonly string[],
  ): { storageKey: string; chords: readonly string[]; isDefault: boolean } => {
    const storageKey = overrideKey(id, configPath);
    const override = overrides[storageKey];
    const chords = override ?? defaults;
    return {
      storageKey,
      chords,
      isDefault: override === undefined || sameChords(override, defaults),
    };
  };

  const builtins: ResolvedBinding[] = actions.map((action) => ({
    ...resolve(action.id, action.defaultChords),
    id: action.id,
    group: action.group,
    description: action.description,
    defaultChords: action.defaultChords,
    remappable: action.remappable,
    nativeMenu: action.nativeMenu ?? false,
    guard: action.guard,
    preventDefault: action.preventDefault,
    order: action.order,
  }));

  const fromConfig: ResolvedBinding[] = configBindingsOf(config).map((binding, i) => ({
    ...resolve(binding.id, binding.defaultChords),
    id: binding.id,
    group: binding.group,
    description: binding.description,
    defaultChords: binding.defaultChords,
    remappable: true,
    nativeMenu: false,
    // A config chord answers a question from anywhere in the form, which is the
    // whole point — so it must stay live while a slider or radio group has
    // focus. `always` is what allows that; the bare-chord rule inside `canFire`
    // is what still keeps it out of the notes box.
    guard: "always" as const,
    preventDefault: true,
    order: CONFIG_ORDER + i / 1000,
    kind: binding.kind,
    field: binding.field,
    choice: binding.choice,
  }));

  return [...builtins, ...fromConfig].toSorted((a, b) => a.order - b.order);
}

/** Two bindings claiming one keystroke, or one claiming a keystroke it may not. */
export interface ChordConflict {
  /** Canonical form, so a conflict reads as one chord however it was spelled. */
  chord: string;
  /** Every binding claiming it — one entry when the problem is `reserved`. */
  bindingIds: string[];
  reserved: boolean;
}

/**
 * Every chord claimed twice, or claimed despite being spoken for.
 *
 * Compares canonical forms so `mod+shift+k` and `shift+mod+K` are recognised as
 * the same keystroke rather than passing as two distinct bindings that would
 * then fight at runtime.
 */
export function findChordConflicts(bindings: readonly ResolvedBinding[]): ChordConflict[] {
  const claims = new Map<string, string[]>();
  /** Chords newly claimed by something that did not already own them. */
  const claimedReserved = new Set<string>();

  for (const binding of bindings) {
    const defaults = new Set(binding.defaultChords.flatMap((text) => canonicalChord(text) ?? []));
    for (const text of binding.chords) {
      const canonical = canonicalChord(text);
      if (canonical === null) continue;
      const existing = claims.get(canonical);
      if (existing) existing.push(binding.id);
      else claims.set(canonical, [binding.id]);

      // "Reserved" means *a config may not claim this*, not that nobody may
      // bind it — the app's own navigation is bound to Enter and the arrows by
      // design. So only a chord taken by something that did not already own it
      // counts: a rebinding onto ⌘V, never ⌘V's rightful owner.
      if (!defaults.has(canonical) && isReservedChord(canonical)) claimedReserved.add(canonical);
    }
  }

  const out: ChordConflict[] = [];
  for (const [chord, bindingIds] of claims) {
    const reserved = claimedReserved.has(chord);
    if (bindingIds.length > 1 || reserved) out.push({ chord, bindingIds, reserved });
  }
  return out;
}
