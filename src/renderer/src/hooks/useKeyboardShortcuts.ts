import { useEffect } from "react";
import { isAutoCopied } from "@core";
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
        const inputNames = new Set(config.input.fields.map((f) => f.name));
        const field = config.output.fields.find(
          (f) => (f.control === "radio" || f.control === "select") && !isAutoCopied(f, inputNames),
        );
        const option = field?.options?.[Number(event.key) - 1];
        if (field && option) setLabel(index, field.name, option.value);
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDone, onToggleHelp]);
}
