import { ChevronLeft, ChevronRight, CircleHelp } from "lucide-react";
import { useStore } from "../store/store";
import { ModeToggle } from "./ModeToggle";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { Button } from "../components/ui/button";
import { Tooltip } from "../components/ui/tooltip";

interface BottomBarProps {
  onHelp?: () => void;
}

export function BottomBar({ onHelp }: BottomBarProps): React.JSX.Element {
  const inputPath = useStore((s) => s.inputPath);
  const index = useStore((s) => s.index);
  const total = useStore((s) => s.records.length);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);

  const filename = inputPath?.split(/[/\\]/).pop() ?? "";

  return (
    <footer className="drag glass grid h-11 shrink-0 grid-cols-3 items-center border-t border-border px-3">
      <span className="text-muted-foreground truncate text-xs">{filename}</span>

      <div className="flex h-full items-center justify-center">
        <button
          type="button"
          onClick={prev}
          disabled={index <= 0}
          aria-label="Previous record"
          className="no-drag flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="no-drag min-w-16 text-center text-xs tabular-nums">
          Record {total > 0 ? index + 1 : 0} of {total}
        </span>
        <button
          type="button"
          onClick={next}
          disabled={index >= total - 1}
          aria-label="Next record"
          className="no-drag flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex h-full items-center justify-end gap-1">
        <ThemeSwitcher />
        <ModeToggle />
        {onHelp && (
          <Tooltip content="Keyboard shortcuts">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onHelp}
              aria-label="Keyboard shortcuts"
              className="no-drag text-muted-foreground hover:text-foreground"
            >
              <CircleHelp size={15} />
            </Button>
          </Tooltip>
        )}
      </div>
    </footer>
  );
}
