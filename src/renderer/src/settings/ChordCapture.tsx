import { useEffect, useRef } from "react";
import { chordFromEvent, formatChord } from "@core";
import { Kbd } from "../components/Kbd";
import { cn } from "../lib/utils";
import { isMac } from "../lib/utils";

/**
 * What the capture control is doing right now.
 *
 * `conflict` and `reserved` are held rather than committed — they are the only
 * states that need a decision from the labeler.
 */
export type CaptureState =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "conflict"; chord: string; withLabel: string }
  | { kind: "reserved"; chord: string }
  | { kind: "committed"; chord: string };

/**
 * Record a keystroke.
 *
 * Deliberately a recorder rather than a text field: the modifier echo while a
 * key is held is what teaches the grammar without any prose, and it makes the
 * difference between "nothing is happening" and "I am listening" visible.
 */
export function ChordCapture({
  chords,
  state,
  label,
  onStart,
  onCancel,
  onCapture,
}: {
  /**
   * Every chord currently bound. Usually one, but an action can ship with
   * several — "move on from this record" answers to both Enter and Space, and
   * showing only the first would hide half of what works.
   */
  chords: readonly string[];
  state: CaptureState;
  /** What this chord does — used to build the accessible name. */
  label: string;
  onStart: () => void;
  onCancel: () => void;
  onCapture: (chord: string) => void;
}): React.JSX.Element {
  const mac = isMac();
  const held = useRef<Set<string>>(new Set());
  const sink = useRef<HTMLInputElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const wasListening = useRef(false);

  // Focused on mount rather than with `autoFocus`: a recorder that does not
  // have the keyboard the moment it says "Listening…" is lying. And when the
  // recording ends the focus has to come back here rather than be dropped,
  // or a keyboard user is returned to the top of the pane.
  useEffect(() => {
    const listening = state.kind === "listening";
    if (listening) sink.current?.focus();
    else if (wasListening.current) trigger.current?.focus();
    wasListening.current = listening;
  }, [state.kind]);

  if (state.kind === "listening") {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex min-w-[200px] items-center gap-2 rounded border border-accent bg-accent/10 px-2 py-1 ring-2 ring-ring">
          {/* Colour and motion are never the only signal — the word is always
              there, and the ring survives prefers-reduced-motion. */}
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse"
          />
          <span className="flex-1 text-xs font-medium text-accent">Listening…</span>
          <span className="flex gap-0.5" aria-hidden="true">
            {[...held.current].map((glyph) => (
              <Kbd key={glyph} className="px-1 py-0 text-[0.625rem]">
                {glyph}
              </Kbd>
            ))}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">Esc to cancel</span>
        {/* An invisible sink for the keystrokes. Focus lands here the moment
            capture starts, so the keydown handler is local rather than global
            and cannot outlive the control. */}
        <input
          ref={sink}
          aria-label={`Press the new shortcut for ${label}`}
          className="sr-only"
          onBlur={onCancel}
          onKeyUp={() => {
            held.current = new Set();
          }}
          onKeyDown={(event) => {
            // Tab must get through, or this is a keyboard trap.
            if (event.key === "Tab") {
              onCancel();
              return;
            }
            // Escape is left alone deliberately. The dialog owns it: it sits
            // above this control and can decide, in one place, whether Escape
            // means "cancel the recording" or "close the pane". Handling it
            // here as well would make the two race, and a portaled node's
            // events reach Radix's document listener whatever this does.
            if (event.key === "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            const recorded = chordFromEvent(event.nativeEvent, mac);
            if (recorded === null) {
              // A modifier on its own. Echo it and keep listening.
              held.current = new Set([
                ...(event.metaKey || event.ctrlKey ? [mac ? "⌘" : "Ctrl"] : []),
                ...(event.altKey ? [mac ? "⌥" : "Alt"] : []),
                ...(event.shiftKey ? ["⇧"] : []),
              ]);
              return;
            }
            onCapture(recorded);
          }}
        />
      </div>
    );
  }

  const problem = state.kind === "conflict" || state.kind === "reserved";
  const shown = problem ? [state.chord] : chords;
  const current = shown.map((c) => formatChord(c, mac)).join(" / ");

  return (
    <button
      ref={trigger}
      type="button"
      onClick={onStart}
      aria-label={
        current
          ? `Change the shortcut for ${label}. Currently ${current}.`
          : `Add a shortcut for ${label}`
      }
      className={cn(
        "inline-flex min-w-[88px] items-center justify-center rounded border px-1.5 py-0.5 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        problem
          ? "border-danger bg-danger/10 text-danger-text"
          : shown
            ? "border-border bg-muted text-foreground hover:border-accent/60 hover:bg-accent/10"
            : // Dashed is already this app's "not yet" signal, from the
              // drag-and-drop target on the start screen.
              "border-dashed border-border text-muted-foreground hover:border-accent/60",
      )}
    >
      {current === "" ? "Add a key" : current}
      {state.kind === "committed" && (
        <span className="ml-1 text-progress-text" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}
