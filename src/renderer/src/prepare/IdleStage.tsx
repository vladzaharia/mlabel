import { Upload } from "lucide-react";
import { usePrepareStore } from "../store/prepare-store";

/** Idle stage: one large drop-or-browse affordance; the card handles drops. */
export function IdleStage(): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const browseFiles = usePrepareStore((s) => s.browseFiles);

  return (
    <div className="p-4">
      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void browseFiles()}
        className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-border bg-accent/[0.03] px-5 py-12 text-center transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Upload size={22} aria-hidden="true" className="mb-1 text-accent" />
        <span className="text-base font-semibold">Drop files here</span>
        <span className="max-w-md text-sm text-muted-foreground">
          MLabel reads them and proposes the right operation — splitting a source, joining labeled
          outputs, or joining unfinished remainders.
        </span>
        <span className="mt-3 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium">
          Browse files…
        </span>
      </button>
    </div>
  );
}
