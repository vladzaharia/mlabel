import { formatChord, type BindingGroup, type ResolvedBinding } from "@core";
import { Dialog, DialogTitle, DialogDescription } from "./ui/dialog";
import { Kbd } from "./Kbd";
import { isMac } from "../lib/utils";
import { useShortcuts } from "../shortcuts/ShortcutProvider";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUP_TITLES: Record<BindingGroup, string> = {
  navigation: "Moving around",
  record: "This record",
  application: "The app",
  config: "From this config",
};

const groupTitle = (group: BindingGroup | string): string =>
  GROUP_TITLES[group as BindingGroup] ?? group;

/** Stable groups in a sensible reading order, with config groups last. */
function groupBindings(bindings: readonly ResolvedBinding[]): [string, ResolvedBinding[]][] {
  const order = ["navigation", "record", "application"];
  const groups = new Map<string, ResolvedBinding[]>();
  for (const binding of bindings) {
    // An unbound action has nothing to show; the settings pane is where it is
    // given a key back.
    if (binding.chords.length === 0) continue;
    const key = String(binding.group);
    const existing = groups.get(key);
    if (existing) existing.push(binding);
    else groups.set(key, [binding]);
  }
  return [...groups].toSorted(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}

/**
 * Every shortcut in force, read from the same resolved table the keyboard
 * handler dispatches on.
 *
 * Previously this was a hardcoded list beside a pass over the config, which
 * meant it could describe keys the app no longer used — and could never show a
 * labeler their own rebindings.
 */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps): React.JSX.Element {
  const { bindings } = useShortcuts();
  const mac = isMac();
  const groups = groupBindings(bindings);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogDescription>All keyboard shortcuts available in this window.</DialogDescription>
      {groups.map(([group, rows]) => (
        <section key={group} className="mt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {groupTitle(group)}
          </h3>
          <table className="mt-1 w-full text-sm" aria-label={groupTitle(group)}>
            <tbody>
              {rows.map((binding) => (
                <tr key={binding.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4 align-top">
                    <span className="flex flex-wrap gap-1">
                      {binding.chords.map((chord) => (
                        <Kbd key={chord}>{formatChord(chord, mac)}</Kbd>
                      ))}
                    </span>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {binding.description}
                    {binding.nativeMenu && (
                      <span className="ml-2 text-xs text-muted-foreground/70">(menu)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </Dialog>
  );
}
