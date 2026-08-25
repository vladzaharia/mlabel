import { formatChord, isUserFilled, titleOf, type AppConfig } from "@core";
import { Dialog, DialogTitle, DialogDescription } from "./ui/dialog";
import { Kbd } from "./Kbd";
import { isMac } from "../lib/utils";
import { useStore } from "../store/store";

interface ShortcutRow {
  keys: string[];
  action: string;
}

/**
 * The built-in shortcuts, plus whatever the loaded config declares.
 *
 * Reading the config means an author who adds a chord doesn't also have to
 * remember to document it — the one place a labeler looks stays truthful.
 */
function buildRows(mac: boolean, config: AppConfig | null): ShortcutRow[] {
  const mod = mac ? "⌘" : "Ctrl+";
  const shift = mac ? "⇧" : "Shift+";
  const rows: ShortcutRow[] = [
    { keys: ["←", "→"], action: "Previous / next record" },
    { keys: [`${shift}←`, `${shift}→`], action: "Previous / next unfinished record" },
    { keys: ["Enter"], action: "Next record" },
    { keys: ["1–9"], action: "Pick the Nth choice of the focused field" },
    { keys: [`${mod}Enter`], action: "Save & export" },
    { keys: [`${mod}${shift}L`], action: "Switch to Label mode" },
    { keys: [`${mod}${shift}P`], action: "Switch to Prepare mode" },
    { keys: ["?"], action: "Toggle this help" },
  ];

  for (const field of config?.output.fields ?? []) {
    if (!isUserFilled(field)) continue;
    const label = titleOf(field.name, field.display);
    if (field.shortcut) {
      rows.push({ keys: [formatChord(field.shortcut, mac)], action: `Focus ${label}` });
    }
    if (field.type !== "enum") continue;
    for (const choice of field.choices) {
      if (!choice.shortcut) continue;
      rows.push({
        keys: [formatChord(choice.shortcut, mac)],
        action: `${label}: ${titleOf(choice.name, choice.display)}`,
      });
    }
  }
  return rows;
}

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Lists all keyboard shortcuts available in the app. */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps): React.JSX.Element {
  const config = useStore((s) => s.config);
  const rows = buildRows(isMac(), config);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogDescription>All keyboard shortcuts available in this window.</DialogDescription>
      <table className="mt-4 w-full text-sm" aria-label="Keyboard shortcuts">
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.keys.join()}-${row.action}`}
              className="border-b border-border/50 last:border-0"
            >
              <td className="py-2 pr-4">
                <span className="flex flex-wrap gap-1">
                  {row.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </td>
              <td className="py-2 text-muted-foreground">{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
