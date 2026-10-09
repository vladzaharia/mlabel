import { useEffect, useRef } from "react";
import {
  canFire,
  chordMatches,
  isUserFilled,
  parseChord,
  toggleChoice,
  type OutputField,
  type GuardContext,
  type ResolvedBinding,
} from "@core";
import { useShortcuts } from "../shortcuts/ShortcutProvider";
import { useStore, type AppStore } from "../store/store";
import { isMac } from "../lib/utils";

interface KeyboardShortcutOptions {
  onDone: () => void;
  onToggleHelp?: () => void;
}

/**
 * Elements for which Enter already means something.
 *
 * Enter natively activates a focused button, opens a Radix select, and inserts
 * a newline in a textarea. Advancing the record as well would double-fire —
 * pressing Enter on "Previous record" would go back one *and* forward one.
 */
const ENTER_IS_TAKEN =
  'button, [role="button"], a[href], summary, textarea, [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="combobox"]';

/**
 * Elements for which Space already means something.
 *
 * Not the same list as Enter's, and the differences are the point: a link
 * *scrolls* on Space rather than activating, so the record should still advance;
 * a textarea and an input are already held back by the `typing` guard upstream.
 */
const SPACE_IS_TAKEN =
  'button, [role="button"], summary, [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="combobox"]';

/** Move focus into a field's widget, wherever the widget keeps its focusable node. */
function focusField(name: string): void {
  const container = document.getElementById(`field-${name}`);
  const focusable = container?.querySelector<HTMLElement>(
    'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
  );
  focusable?.focus();
}

/**
 * Drive the labeling keyboard from the resolved binding table.
 *
 * Everything about *what* a key does, *when* it may fire, and in what order
 * lives in `@core/actions`; this hook is the part that has to touch the DOM —
 * reading the focused element, and performing the action. That split is what
 * lets the guards be unit-tested without a browser, and what lets the settings
 * pane rebind any of it.
 */
export function useKeyboardShortcuts({ onDone, onToggleHelp }: KeyboardShortcutOptions): void {
  const { bindings } = useShortcuts();

  // Read through a ref rather than a dependency: `resolveBindings` returns a
  // fresh array every render, so depending on it would tear down and reinstall
  // the window listener on every single render.
  const latest = useRef({ bindings, onDone, onToggleHelp });
  latest.current = { bindings, onDone, onToggleHelp };

  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      // An open modal owns the keyboard. Radix traps Tab but not this window
      // listener, so without this guard the resume prompt was live-fire: digits
      // wrote labels to the record behind it, and ⌘Enter exported *and* cleared
      // the very session the dialog was asking whether to restore.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const ctx: GuardContext = {
        // A field that consumes keystrokes has focus: text entry, or a Radix
        // widget (slider/radio/select) that handles arrows and digit typeahead.
        typing:
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable === true ||
          target?.closest(
            '[role="combobox"], [role="slider"], [role="radiogroup"], [role="listbox"]',
          ) != null,
        // Narrower than `typing`: where a *letter* means "insert this letter" or
        // drives typeahead. A radiogroup and a slider consume arrows, not
        // letters, so a bare choice chord stays live while one of them has
        // focus — which is what makes those chords usable from anywhere.
        textEntry:
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable === true ||
          target?.closest('[role="combobox"], [role="listbox"]') != null,
        defaultPrevented: event.defaultPrevented,
        enterTaken: target?.closest(ENTER_IS_TAKEN) != null,
        spaceTaken: target?.closest(SPACE_IS_TAKEN) != null,
        // IME commits arrive as Enter too, so a composing keystroke must not
        // move the record out from under the text being composed.
        composing: event.isComposing || event.keyCode === 229,
      };

      const state = useStore.getState();
      const mac = isMac();

      for (const binding of latest.current.bindings) {
        // Main handles these as Electron accelerators; they are listed only so
        // the help dialog and the settings pane can show them.
        if (binding.nativeMenu) continue;
        // The digits are positional rather than a chord per key, so they are
        // matched below. Falling through here would consume the keystroke and
        // never reach the handler that knows which option `4` means.
        if (binding.id === "record.pickNth") continue;

        for (const text of binding.chords) {
          const chord = parseChord(text);
          if (!chord || !chordMatches(chord, event, mac)) continue;
          if (!canFire(binding.guard, chord, ctx)) continue;
          if (binding.preventDefault) event.preventDefault();
          run(binding, state, latest.current);
          return;
        }
      }

      // The digits are one positional behaviour rather than nine bindings, so
      // they are matched here rather than as chords in the table.
      if (pickNthEnabled(latest.current.bindings) && /^[1-9]$/.test(event.key)) {
        if (ctx.typing || ctx.defaultPrevented) return;
        const { records, index, setLabel, config } = state;
        const record = records[index];
        if (!config || !record) return;
        // Scoped to the focused field when there is one. Anchored to the first
        // choice field otherwise, so a second enum was previously unreachable.
        const field =
          focusedChoiceField(config.output.fields, target) ??
          firstChoiceField(config.output.fields);
        const choice = field?.type === "enum" ? field.choices[Number(event.key) - 1] : undefined;
        if (field && choice) setLabel(index, field.name, choice.name);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

const pickNthEnabled = (bindings: readonly ResolvedBinding[]): boolean =>
  bindings.find((b) => b.id === "record.pickNth")?.chords.length !== 0;

/** Perform whatever the matched binding stands for. */
function run(
  binding: ResolvedBinding,
  state: AppStore,
  handlers: { onDone: () => void; onToggleHelp?: () => void },
): void {
  switch (binding.id) {
    case "app.done":
      handlers.onDone();
      return;
    case "app.help":
      handlers.onToggleHelp?.();
      return;
    case "nav.next":
    case "record.advance":
      state.next();
      return;
    case "nav.prev":
      state.prev();
      return;
    case "nav.nextIncomplete":
      state.gotoIncomplete(1);
      return;
    case "nav.prevIncomplete":
      state.gotoIncomplete(-1);
      return;
  }

  // A binding the config brought with it. Choice chords deliberately fire
  // wherever focus happens to be — answering shouldn't require tabbing to the
  // question first, and the validator guarantees one chord names one option.
  if (binding.field === undefined) return;
  if (binding.kind === "focus-field") {
    focusField(binding.field);
    return;
  }
  if (binding.choice === undefined) return;

  if (binding.kind === "pick-choice") {
    state.setLabel(state.index, binding.field, binding.choice);
    return;
  }

  const field = state.config?.output.fields.find((f) => f.name === binding.field);
  if (field?.type !== "array" || field.items.type !== "enum") return;
  const current =
    state.labels[state.index]?.[binding.field] ??
    state.records[state.index]?.labelValues[binding.field];
  // A multi-select chord toggles rather than replaces, matching what clicking
  // the same checkbox twice does.
  state.setLabel(
    state.index,
    binding.field,
    toggleChoice(
      current,
      binding.choice,
      field.items.choices.map((c) => c.name),
    ),
  );
}

const isChoiceField = (field: OutputField): boolean => field.type === "enum" && isUserFilled(field);

function firstChoiceField(fields: readonly OutputField[]): OutputField | undefined {
  return fields.find(isChoiceField);
}

/** The choice field the caret is inside, if any. */
function focusedChoiceField(
  fields: readonly OutputField[],
  target: HTMLElement | null,
): OutputField | undefined {
  const container = target?.closest<HTMLElement>("[id^='field-']");
  const name = container?.id.slice("field-".length);
  if (name === undefined) return undefined;
  const field = fields.find((f) => f.name === name);
  return field && isChoiceField(field) ? field : undefined;
}
