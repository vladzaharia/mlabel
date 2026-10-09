import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  SlidersHorizontal,
} from "lucide-react";
import { selectHasIncompleteAfter, selectHasIncompleteBefore, useStore } from "../store/store";
import { ModeToggle } from "./ModeToggle";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Button } from "../components/ui/button";
import { Kbd } from "../components/Kbd";
import { Tooltip } from "../components/ui/tooltip";
import { useShortcuts } from "../shortcuts/ShortcutProvider";
import { cn } from "../lib/utils";

interface BottomBarProps {
  onHelp?: () => void;
  onSettings?: () => void;
}

/**
 * One navigation control.
 *
 * Uses `aria-disabled` plus a swallowed Enter rather than the `disabled`
 * attribute, matching the rest of this bar: a disabled button drops out of the
 * tab order entirely, so a screen-reader user loses the only clue that they are
 * at the end of the file.
 */
function NavButton({
  onClick,
  disabled,
  label,
  hint,
  ariaKeys,
  /** Which side the key sits on, so a hint never lands between two buttons. */
  hintSide = "right",
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  hint?: string;
  ariaKeys?: string;
  hintSide?: "left" | "right";
  children: React.ReactNode;
}): React.JSX.Element {
  // The key sits beside the icon rather than under it. Stacked, it pushed the
  // row to two lines inside an 11px-tall bar and read as a caption for the
  // whole bar; alongside, it reads as this button's key — and the hints for
  // "back" and "forward" end up mirrored around the counter, which is the
  // shape of the thing they do.
  const key = hint && (
    <Kbd className="no-drag px-1 py-0 text-[0.5625rem] leading-none text-muted-foreground/70">
      {hint}
    </Kbd>
  );
  return (
    <div className="flex h-full items-center gap-1">
      {hintSide === "left" && key}
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled}
        aria-label={label}
        aria-keyshortcuts={ariaKeys}
        onKeyDown={(e) => disabled && e.key === "Enter" && e.preventDefault()}
        className={cn(
          "no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          // `disabled:` variants never apply here, because the attribute is
          // `aria-disabled` — so the dimming has to be spelled out.
          disabled && "pointer-events-none opacity-30",
        )}
      >
        {children}
      </button>
      {hintSide === "right" && key}
    </div>
  );
}

export function BottomBar({ onHelp, onSettings }: BottomBarProps): React.JSX.Element {
  const inputPath = useStore((s) => s.inputPath);
  const index = useStore((s) => s.index);
  const total = useStore((s) => s.records.length);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const gotoIncomplete = useStore((s) => s.gotoIncomplete);
  const hasIncompleteAfter = useStore(selectHasIncompleteAfter);
  const hasIncompleteBefore = useStore(selectHasIncompleteBefore);
  const { chordFor, ariaFor } = useShortcuts();

  const filename = inputPath?.split(/[/\\]/).pop() ?? "";

  return (
    <footer className="drag glass grid h-11 shrink-0 grid-cols-3 items-center border-t border-border px-3">
      <span className="text-muted-foreground truncate text-xs">{filename}</span>

      <div className="flex h-full items-center justify-center gap-1">
        <NavButton
          onClick={() => gotoIncomplete(-1)}
          disabled={!hasIncompleteBefore}
          label="Previous unfinished record"
          hint={chordFor("nav.prevIncomplete")}
          ariaKeys={ariaFor("nav.prevIncomplete")}
          hintSide="left"
        >
          <ChevronsLeft size={18} aria-hidden="true" />
        </NavButton>
        <NavButton
          onClick={prev}
          disabled={index <= 0}
          label="Previous record"
          hint={chordFor("nav.prev")}
          ariaKeys={ariaFor("nav.prev")}
          hintSide="left"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </NavButton>
        <span className="no-drag mx-4 min-w-16 text-center text-xs tabular-nums">
          Record {total > 0 ? index + 1 : 0} of {total}
        </span>
        <NavButton
          onClick={next}
          disabled={index >= total - 1}
          label="Next record"
          hint={chordFor("nav.next")}
          ariaKeys={ariaFor("nav.next")}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </NavButton>
        <NavButton
          onClick={() => gotoIncomplete(1)}
          disabled={!hasIncompleteAfter}
          label="Next unfinished record"
          hint={chordFor("nav.nextIncomplete")}
          ariaKeys={ariaFor("nav.nextIncomplete")}
        >
          <ChevronsRight size={18} aria-hidden="true" />
        </NavButton>
      </div>

      <div className="flex h-full items-center justify-end gap-1">
        <ThemeSwitcher />
        <ModeToggle />
        {onSettings && (
          <Tooltip content="Settings">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onSettings}
              aria-label="Settings"
              aria-keyshortcuts={ariaFor("app.settings")}
              className="no-drag text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
        {onHelp && (
          <Tooltip content="Keyboard shortcuts">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onHelp}
              aria-label="Keyboard shortcuts"
              aria-keyshortcuts={ariaFor("app.help")}
              className="no-drag text-muted-foreground hover:text-foreground"
            >
              <CircleHelp size={15} aria-hidden="true" />
            </Button>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}
