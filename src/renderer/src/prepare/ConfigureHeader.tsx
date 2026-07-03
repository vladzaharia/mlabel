import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { PrepareOp } from "../store/prepare-store";
import { opLabel, usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

/** Configure-stage chrome: operation chip, change-operation, start-over. */
export function ConfigureHeader({ op }: { op: PrepareOp }): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const changeOp = usePrepareStore((s) => s.changeOp);
  const reset = usePrepareStore((s) => s.reset);
  const headingRef = useHeadingFocus();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 text-sm font-semibold text-accent outline-none"
        >
          {opLabel(op)}
        </h2>
        <Button variant="outline" size="xs" disabled={busy} onClick={changeOp}>
          Change operation
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Start over"
        disabled={busy}
        onClick={reset}
        className="text-muted-foreground hover:text-foreground"
      >
        <X size={13} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Small uppercase section label used inside configure stages. */
export function Eyebrow({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="text-[11px] font-semibold uppercase text-muted-foreground">{children}</p>;
}
