import { FileQuestion, Upload, X } from "lucide-react";
import type { PrepareAction } from "../store/prepare-store";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { baseName, cn } from "../lib/utils";

function activeCopy(action: PrepareAction): { title: string; description: string } {
  switch (action) {
    case null:
      return {
        title: "Drop files here",
        description:
          "With no action selected, MLabel detects whether to split sources or join prepared files.",
      };
    case "split":
      return {
        title: "Drop source file to split",
        description: "This action treats the first dropped file as the source input.",
      };
    case "join-output":
      return {
        title: "Drop output files to join",
        description: "This action treats dropped files as labeled output parts.",
      };
    case "join-remaining":
      return {
        title: "Drop remaining files to join",
        description: "This action treats dropped files as unfinished remaining parts.",
      };
  }
}

export function PrepareDropSurface(): React.JSX.Element {
  const selectedAction = usePrepareStore((s) => s.selectedAction);
  const busy = usePrepareStore((s) => s.busy);
  const pendingDrop = usePrepareStore((s) => s.pendingDrop);
  const addDroppedPaths = usePrepareStore((s) => s.addDroppedPaths);
  const pickSplitFile = usePrepareStore((s) => s.pickSplitFile);
  const pickJoinFiles = usePrepareStore((s) => s.pickJoinFiles);
  const resolvePendingDrop = usePrepareStore((s) => s.resolvePendingDrop);
  const clearPendingDrop = usePrepareStore((s) => s.clearPendingDrop);
  const copy = activeCopy(selectedAction);

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const paths = [...event.dataTransfer.files].map((file) => window.api.pathForFile(file));
    void addDroppedPaths(paths);
  }

  if (pendingDrop) {
    return (
      <section className="glass-card rounded-xl border border-warning/30 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning-text">
              <FileQuestion size={18} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Choose how to use these files</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {pendingDrop.paths.map(baseName).join(", ")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss drop resolver"
            onClick={clearPendingDrop}
            className="self-start text-muted-foreground hover:text-foreground"
          >
            <X size={13} aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {pendingDrop.summaries.map((summary) => (
            <button
              key={summary.tab}
              type="button"
              disabled={busy}
              onClick={() => void resolvePendingDrop(summary.tab)}
              className={cn(
                "rounded-lg border border-border bg-background/35 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                summary.ok && "border-progress/30 bg-progress/5",
                !summary.ok && summary.errors > 0 && "border-danger/30 bg-danger/5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{summary.label}</span>
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px]",
                    summary.ok
                      ? "bg-progress/10 text-progress-text"
                      : "bg-danger/10 text-danger-text",
                  )}
                >
                  {summary.ok ? "Valid" : "Check"}
                </span>
              </div>
              <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                {summary.fileCount} file{summary.fileCount === 1 ? "" : "s"} · {summary.totalRows}{" "}
                row{summary.totalRows === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.errors} error{summary.errors === 1 ? "" : "s"} · {summary.warnings} warning
                {summary.warnings === 1 ? "" : "s"}
              </p>
              {summary.message && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{summary.message}</p>
              )}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="glass-card flex flex-col gap-3 rounded-xl border border-dashed border-border px-5 py-4 shadow-sm sm:flex-row sm:items-center"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Upload size={19} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{copy.title}</h2>
        <p className="text-xs text-muted-foreground">{copy.description}</p>
      </div>
      <div className="shrink-0 sm:ml-auto">
        {selectedAction === "split" && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void pickSplitFile()}>
            Choose source…
          </Button>
        )}
        {selectedAction === "join-output" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void pickJoinFiles("output")}
          >
            Choose outputs…
          </Button>
        )}
        {selectedAction === "join-remaining" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void pickJoinFiles("remaining")}
          >
            Choose remaining…
          </Button>
        )}
      </div>
    </section>
  );
}
