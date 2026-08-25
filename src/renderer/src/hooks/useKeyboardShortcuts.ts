import { useEffect } from "react";
import {
  chordMatches,
  isBareChord,
  isUserFilled,
  parseChord,
  toggleChoice,
  type OutputField,
} from "@core";
import { useStore } from "../store/store";
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

/** Move focus into a field's widget, wherever the widget keeps its focusable node. */
function focusField(name: string): void {
  const container = document.getElementById(`field-${name}`);
  const focusable = container?.querySelector<HTMLElement>(
    'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
  );
  focusable?.focus();
}

/**
 * Core labeling shortcuts:
 *   ← / →           previous / next record
 *   ⇧← / ⇧→         previous / next *incomplete* record
 *   Enter           next record (except where Enter already means something)
 *   ⌘/Ctrl + Enter  Done (export)
 *   1–9             pick the Nth choice of the focused (or first) choice field
 *   config chords   focus a field, or select one of its choices
 *   ?               toggle the keyboard shortcuts help dialog
 */
export function useKeyboardShortcuts({ onDone, onToggleHelp }: KeyboardShortcutOptions): void {
  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      // An open modal owns the keyboard. Radix traps Tab but not this window
      // listener, so without this guard the resume prompt was live-fire: digits
      // wrote labels to the record behind it, and ⌘Enter exported *and* cleared
      // the very session the dialog was asking whether to restore.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      // A field that consumes keystrokes has focus: text entry, or a Radix
      // widget (slider/radio/select) that handles arrows and digit typeahead.
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true ||
        target?.closest(
          '[role="combobox"], [role="slider"], [role="radiogroup"], [role="listbox"]',
        ) != null;

      // Narrower than `typing`: where a *letter* means "insert this letter" or
      // drives typeahead. A radiogroup and a slider consume arrows, not letters,
      // so a bare choice chord stays live while one of them has focus — which is
      // what makes those chords usable from anywhere in the form.
      const textEntry =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true ||
        target?.closest('[role="combobox"], [role="listbox"]') != null;

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onDone();
        return;
      }

      const state = useStore.getState();
      const config = state.config;

      // Matched before the typing guard so a `mod+`-style accelerator stays
      // reachable from inside a text field. Bare chords are held back there by
      // `textEntry` instead — see matchConfigChords.
      if (config && matchConfigChords(event, config.output.fields, state, textEntry)) return;

      // Radix widgets preventDefault on keys they consume — never double-handle.
      if (typing || event.defaultPrevented) return;

      if (event.key === "?") {
        onToggleHelp?.();
        return;
      }

      if (event.key === "ArrowRight") {
        if (event.shiftKey) state.gotoIncomplete(1);
        else state.next();
        return;
      }
      if (event.key === "ArrowLeft") {
        if (event.shiftKey) state.gotoIncomplete(-1);
        else state.prev();
        return;
      }

      // Enter advances, but only where Enter is otherwise idle. IME commits
      // arrive as Enter too, so a composing keystroke must not move the record.
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.altKey &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        !target?.closest(ENTER_IS_TAKEN)
      ) {
        event.preventDefault();
        state.next();
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const { records, index, setLabel } = state;
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
  }, [onDone, onToggleHelp]);
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

/**
 * Try the chords a config declared: a field's own `shortcut` moves focus to it,
 * and a choice's `shortcut` picks that choice from anywhere in the app.
 *
 * Choice chords are deliberately *not* scoped to the focused field — answering
 * shouldn't require tabbing to the question first. The validator enforces that
 * one chord names one option, so there is never an ambiguous keystroke.
 *
 * Returns true when one fired, so the caller stops.
 */
function matchConfigChords(
  event: KeyboardEvent,
  fields: readonly OutputField[],
  state: ReturnType<typeof useStore.getState>,
  textEntry: boolean,
): boolean {
  const mac = isMac();

  /** Whether this chord is both a match and allowed to fire right now. */
  const fires = (text: string | undefined): boolean => {
    if (text === undefined) return false;
    const chord = parseChord(text);
    if (!chord) return false;
    // In a text box a bare letter is just that letter, and a widget that already
    // consumed the key has the stronger claim on it.
    if ((textEntry || event.defaultPrevented) && isBareChord(chord)) return false;
    return chordMatches(chord, event, mac);
  };

  for (const field of fields) {
    if (!isUserFilled(field)) continue;

    if (fires(field.shortcut)) {
      event.preventDefault();
      focusField(field.name);
      return true;
    }

    if (field.type === "enum") {
      const choice = field.choices.find((c) => fires(c.shortcut));
      if (choice) {
        event.preventDefault();
        state.setLabel(state.index, field.name, choice.name);
        return true;
      }
    } else if (field.type === "array" && field.items.type === "enum") {
      const options = field.items.choices;
      const choice = options.find((c) => fires(c.shortcut));
      if (choice) {
        event.preventDefault();
        // A multi-select chord toggles rather than replaces, matching what
        // clicking the same checkbox twice does.
        const current =
          state.labels[state.index]?.[field.name] ??
          state.records[state.index]?.labelValues[field.name];
        const next = toggleChoice(
          current,
          choice.name,
          options.map((c) => c.name),
        );
        state.setLabel(state.index, field.name, next);
        return true;
      }
    }
  }
  return false;
}
