import { ChevronLeft, ChevronRight, Moon, Sun, SunMoon } from "lucide-react";
import { useStore } from "../store/store";
import { Tooltip } from "../components/ui/tooltip";

const themeIcon = { system: SunMoon, light: Sun, dark: Moon } as const;

export function BottomBar(): React.JSX.Element {
  const inputPath = useStore((s) => s.inputPath);
  const index = useStore((s) => s.index);
  const total = useStore((s) => s.records.length);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);
  const themeMode = useStore((s) => s.themeMode);
  const cycleTheme = useStore((s) => s.cycleTheme);

  const filename = inputPath?.split(/[/\\]/).pop() ?? "";
  const ThemeIcon = themeIcon[themeMode];

  return (
    <footer className="drag glass grid h-11 shrink-0 grid-cols-3 items-center border-t border-border px-3">
      <span className="text-muted-foreground truncate text-xs">{filename}</span>

      <div className="flex h-full items-center justify-center">
        <button
          type="button"
          onClick={prev}
          disabled={index <= 0}
          aria-label="Previous record"
          className="no-drag flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="no-drag min-w-16 text-center text-xs tabular-nums">
          {total > 0 ? index + 1 : 0} / {total}
        </span>
        <button
          type="button"
          onClick={next}
          disabled={index >= total - 1}
          aria-label="Next record"
          className="no-drag flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="flex h-full items-center justify-end">
        <Tooltip content={`Theme: ${themeMode}`}>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="Toggle theme"
            className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ThemeIcon size={15} />
          </button>
        </Tooltip>
      </div>
    </footer>
  );
}
