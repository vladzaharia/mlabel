import { useState } from "react";
import { RotateCcw, Lock } from "lucide-react";
import {
  canonicalChord,
  findChordConflicts,
  formatChord,
  isReservedChord,
  type ResolvedBinding,
} from "@core";
import { announce } from "../a11y/announcer";
import { Button } from "../components/ui/button";
import { Callout } from "../components/Callout";
import { SEVERITY } from "../components/Severity";
import { useShortcuts } from "../shortcuts/ShortcutProvider";
import { useStore } from "../store/store";
import { isMac, cn } from "../lib/utils";
import { ChordCapture, type CaptureState } from "./ChordCapture";
import { Empty, Eyebrow, SettingsSection } from "./SettingsSection";

const GROUP_TITLES: Record<string, string> = {
  navigation: "Moving around",
  record: "This record",
  application: "The app",
};

const groupTitle = (group: string): string => GROUP_TITLES[group] ?? group;

/** Group in reading order, with anything the config brought in coming last. */
function grouped(bindings: readonly ResolvedBinding[]): [string, ResolvedBinding[]][] {
  const order = ["navigation", "record", "application"];
  const map = new Map<string, ResolvedBinding[]>();
  for (const binding of bindings) {
    const key = String(binding.group);
    const existing = map.get(key);
    if (existing) existing.push(binding);
    else map.set(key, [binding]);
  }
  return [...map].toSorted(([a], [b]) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}

export function KeysSection({
  onCapturingChange,
}: {
  /**
   * Told when a capture starts or ends, with a way to call it off.
   *
   * The dialog is the single owner of Escape — it is the thing Radix will close
   * — so it needs both to know a recording is in progress and to be able to
   * cancel it.
   */
  onCapturingChange?: (capturing: boolean, cancel?: () => void) => void;
}): React.JSX.Element {
  const { bindings } = useShortcuts();
  const overrides = useStore((s) => s.shortcutOverrides);
  const updateSettings = useStore((s) => s.updateSettings);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [state, setState] = useState<CaptureState>({ kind: "idle" });
  const [filter, setFilter] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const mac = isMac();

  const changed = bindings.filter((b) => !b.isDefault);

  const write = (next: Record<string, readonly string[]>): void => {
    void updateSettings({
      shortcuts: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, [...v]])),
    });
  };

  function commit(binding: ResolvedBinding, chord: string): void {
    const canonical = canonicalChord(chord);
    if (canonical === null) return;

    if (isReservedChord(canonical) && !binding.defaultChords.includes(chord)) {
      setState({ kind: "reserved", chord });
      announce(`${formatChord(chord, mac)} belongs to the system.`, "assertive");
      return;
    }

    // Detect against the *resolved* set — exactly what the keyboard handler
    // would dispatch on — rather than against the defaults.
    const candidate = bindings.map((b) => (b.id === binding.id ? { ...b, chords: [chord] } : b));
    const clash = findChordConflicts(candidate).find(
      (c) => c.chord === canonical && c.bindingIds.length > 1,
    );
    if (clash) {
      const otherId = clash.bindingIds.find((id) => id !== binding.id);
      const other = bindings.find((b) => b.id === otherId);
      setState({ kind: "conflict", chord, withLabel: other?.description ?? "another action" });
      return;
    }

    write({ ...overrides, [binding.storageKey]: [chord] });
    setState({ kind: "committed", chord });
    setCapturing(null);
    onCapturingChange?.(false);
    announce(`${formatChord(chord, mac)} saved for ${binding.description}.`);
  }

  function reset(binding: ResolvedBinding): void {
    const next = { ...overrides };
    delete next[binding.storageKey];
    write(next);
    const restored = binding.defaultChords[0];
    announce(
      restored
        ? `${binding.description} reset to ${formatChord(restored, mac)}.`
        : `${binding.description} reset.`,
    );
  }

  const matches = (binding: ResolvedBinding): boolean => {
    if (onlyChanged && binding.isDefault) return false;
    if (filter === "") return true;
    const haystack = [
      binding.description,
      String(binding.group),
      ...binding.chords.map((c) => formatChord(c, mac)),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(filter.toLowerCase());
  };

  const visible = bindings.filter(matches);

  return (
    <SettingsSection
      title="Keys and chords"
      action={
        <Button
          variant="outline"
          size="xs"
          disabled={changed.length === 0}
          onClick={() => {
            write({});
            announce("All shortcuts reset to their defaults.");
          }}
        >
          Reset all ({changed.length})
        </Button>
      }
    >
      {/* Not polish: a config with eight choice fields is ninety rows, and
          without these the section *is* the settings pane. */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter shortcuts"
          className="h-9 w-full rounded-md border border-border bg-background/40 px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          variant="outline"
          size="xs"
          aria-pressed={onlyChanged}
          onClick={() => setOnlyChanged((v) => !v)}
          // Matched to the filter field's height rather than the default `xs`,
          // so the pair reads as one control strip instead of a button that
          // came up short next to its input.
          className={cn("h-9 shrink-0", onlyChanged && "border-accent text-accent")}
        >
          Only changed
        </Button>
      </div>

      {visible.length === 0 && <Empty>No shortcuts match that.</Empty>}

      {grouped(visible).map(([group, rows]) => (
        <div key={group}>
          <Eyebrow>{groupTitle(group)}</Eyebrow>
          <div className="mt-1 divide-y divide-border/50 overflow-hidden rounded-lg border border-border">
            {rows.map((binding) => {
              const active = capturing === binding.id;
              return (
                <div key={binding.id} className="px-3 py-2">
                  <div className="flex min-h-9 items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm" title={binding.description}>
                      {binding.description}
                    </span>
                    {!binding.remappable && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 text-[11px] text-muted-foreground">
                        <Lock size={11} aria-hidden="true" />
                        {binding.nativeMenu ? "Menu" : "Fixed"}
                      </span>
                    )}
                    {binding.remappable ? (
                      <ChordCapture
                        chords={binding.chords}
                        label={binding.description}
                        state={active ? state : { kind: "idle" }}
                        onStart={() => {
                          setCapturing(binding.id);
                          setState({ kind: "listening" });
                          onCapturingChange?.(true, () => {
                            setCapturing(null);
                            setState({ kind: "idle" });
                          });
                          announce(
                            `Listening for a new shortcut for ${binding.description}. Press Escape to cancel.`,
                            "assertive",
                          );
                        }}
                        onCancel={() => {
                          setCapturing(null);
                          setState({ kind: "idle" });
                          onCapturingChange?.(false);
                        }}
                        onCapture={(chord) => commit(binding, chord)}
                      />
                    ) : (
                      <span className="min-w-[88px] text-right font-mono text-xs text-muted-foreground">
                        {binding.chords.map((c) => formatChord(c, mac)).join(" / ")}
                      </span>
                    )}
                    <span className="flex w-12 shrink-0 items-center justify-end gap-1">
                      {!binding.isDefault && (
                        <>
                          <span
                            className="size-1.5 rounded-full bg-accent"
                            aria-hidden="true"
                            title="Changed from the default"
                          />
                          <span className="sr-only">Changed from the default</span>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => reset(binding)}
                            aria-label={
                              binding.defaultChords[0]
                                ? `Reset ${binding.description} to ${formatChord(binding.defaultChords[0], mac)}`
                                : `Reset ${binding.description}`
                            }
                          >
                            <RotateCcw size={12} aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </span>
                  </div>

                  {active && state.kind === "conflict" && (
                    <Callout tone="danger" className="mt-2">
                      {formatChord(state.chord, mac)} already does “{state.withLabel}”.
                      <span className="mt-1 flex gap-2">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setState({ kind: "listening" })}
                        >
                          Try another key
                        </Button>
                      </span>
                    </Callout>
                  )}
                  {active && state.kind === "reserved" && (
                    <Callout tone="warning" className="mt-2">
                      {formatChord(state.chord, mac)} belongs to the system. Pick another.
                      <span className="mt-1 flex gap-2">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setState({ kind: "listening" })}
                        >
                          Try another key
                        </Button>
                      </span>
                    </Callout>
                  )}
                  {binding.chords.length === 0 && binding.remappable && !active && (
                    <p className={cn("mt-1 text-xs", SEVERITY.muted.textClass)}>
                      No key — this action can only be reached by clicking.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}
