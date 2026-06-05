import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../store/store";

export function BottomBar(): React.JSX.Element {
  const inputPath = useStore((s) => s.inputPath);
  const index = useStore((s) => s.index);
  const total = useStore((s) => s.records.length);
  const next = useStore((s) => s.next);
  const prev = useStore((s) => s.prev);

  const filename = inputPath?.split(/[/\\]/).pop() ?? "";

  return (
    <footer className="drag glass flex h-11 shrink-0 items-center border-t border-border px-3">
      <span className="text-muted-foreground truncate text-xs">{filename}</span>

      <div className="ml-auto flex h-full items-center">
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
    </footer>
  );
}
