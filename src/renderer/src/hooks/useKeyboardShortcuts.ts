import { useEffect } from "react";
import { isAutoCopied } from "@core";
import { useStore } from "../store/store";

/**
 * Core labeling shortcuts:
 *   ← / → : previous / next record (ignored while typing in a field)
 *   ⌘/Ctrl + Enter : Done (export)
 *   1–9 : pick the Nth option of the first radio/select output field
 */
export function useKeyboardShortcuts(onDone: () => void): void {
  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onDone();
        return;
      }
      if (typing) return;

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
  }, [onDone]);
}
