import { Dialog, DialogTitle } from "./ui/dialog";
import { isMac } from "../lib/utils";
import { cn } from "../lib/utils";

interface ShortcutRow {
  keys: string[];
  action: string;
}

function buildRows(mac: boolean): ShortcutRow[] {
  const mod = mac ? "⌘" : "Ctrl+";
  const shift = mac ? "⇧" : "Shift+";
  return [
    { keys: ["←", "→"], action: "Previous / next record" },
    { keys: ["1–9"], action: "Pick Nth option of the first choice field" },
    { keys: [`${mod}Enter`], action: "Save & export" },
    { keys: [`${mod}${shift}L`], action: "Switch to Label mode" },
    { keys: [`${mod}${shift}P`], action: "Switch to Prepare mode" },
    { keys: ["?"], action: "Toggle this help" },
  ];
}

function Kbd({ children }: { children: string }): React.JSX.Element {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </kbd>
  );
}

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Lists all keyboard shortcuts available in the app. */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps): React.JSX.Element {
  const rows = buildRows(isMac());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <table className="mt-4 w-full text-sm" aria-label="Keyboard shortcuts">
        <tbody>
          {rows.map((row) => (
            <tr key={row.action} className={cn("border-b border-border/50 last:border-0")}>
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
