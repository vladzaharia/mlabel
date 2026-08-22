import { useEffect } from "react";
import { isUserFilled } from "@core";
import { useStore } from "../store/store";

interface KeyboardShortcutOptions {
  onDone: () => void;
  onToggleHelp?: () => void;
}

/**
 * Core labeling shortcuts:
 *   ← / → : previous / next record (ignored while typing in a field)
 *   ⌘/Ctrl + Enter : Done (export)
 *   1–9 : pick the Nth option of the first radio/select output field
 *   ? : toggle the keyboard shortcuts help dialog
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

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onDone();
        return;
      }
      // Radix widgets preventDefault on keys they consume — never double-handle.
      if (typing || event.defaultPrevented) return;

      if (event.key === "?") {
        onToggleHelp?.();
        return;
      }

      const state = useStore.getState();
      if (event.key === "ArrowRight") {
        state.next();
        return;
      }
      if (event.key === "ArrowLeft") {
        state.prev();
        return;
      }

      if (/^[1-9]$/.test(event.key)) {
        const { config, records, index, setLabel } = state;
        const record = records[index];
        if (!config || !record) return;
        const field = config.output.fields.find((f) => f.type === "enum" && isUserFilled(f));
        const choice = field?.type === "enum" ? field.choices[Number(event.key) - 1] : undefined;
        if (field && choice) setLabel(index, field.name, choice.name);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDone, onToggleHelp]);
}
