import { ArrowRight, Loader2, X } from "lucide-react";
import type { PrepareStage } from "../store/prepare-store";
import { opLabel, usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { baseName, cn } from "../lib/utils";

/** Confirm stage: heuristic proposals as a radiogroup, user approves one. */
export function ConfirmStage({
  stage,
}: {
  stage: Extract<PrepareStage, { kind: "confirm" }>;
}): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const selectOp = usePrepareStore((s) => s.selectOp);
  const confirmOp = usePrepareStore((s) => s.confirmOp);
  const reset = usePrepareStore((s) => s.reset);
  const headingRef = useHeadingFocus();
  const count = stage.paths.length;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-sm font-semibold outline-none">
            {count} file{count === 1 ? "" : "s"} ready — confirm the operation
          </h2>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {stage.paths.map(baseName).join(", ")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Start over"
          onClick={reset}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X size={13} aria-hidden="true" />
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
          {error}
        </div>
      )}

      <fieldset className="min-w-0 border-0 p-0" disabled={busy}>
        <legend className="sr-only">Operation</legend>
        <div className="grid gap-2 pt-1 md:grid-cols-3">
          {stage.proposals.map((proposal) => {
            const selected = stage.selected === proposal.op;
            return (
              <label
                key={proposal.op}
                className={cn(
                  "relative block cursor-pointer rounded-lg border border-border bg-background/35 p-3 transition-colors hover:bg-muted",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  selected && "border-accent bg-accent/10 ring-1 ring-accent",
                  busy && "pointer-events-none opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="prepare-operation"
                  className="sr-only"
                  checked={selected}
                  onChange={() => selectOp(proposal.op)}
                />
                {stage.recommended === proposal.op && (
                  <span className="absolute -top-2 left-2 rounded-md border border-accent/40 bg-accent/15 px-1.5 text-[10px] font-semibold uppercase text-accent">
                    Recommended
                  </span>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{proposal.label}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px]",
                      proposal.ok
                        ? "bg-progress/10 text-progress-text"
                        : proposal.errors > 0
                          ? "bg-danger/10 text-danger-text"
                          : "bg-warning/10 text-warning-text",
                    )}
                  >
                    {proposal.ok
                      ? "Valid"
                      : proposal.errors > 0
                        ? `${String(proposal.errors)} error${proposal.errors === 1 ? "" : "s"}`
                        : `${String(proposal.warnings)} warning${proposal.warnings === 1 ? "" : "s"}`}
                  </span>
                </div>
                <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                  {proposal.fileCount} file{proposal.fileCount === 1 ? "" : "s"} ·{" "}
                  {proposal.totalRows} row{proposal.totalRows === 1 ? "" : "s"}
                </p>
                {proposal.message && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {proposal.message}
                  </p>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button disabled={busy || !stage.selected} onClick={confirmOp}>
          {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
          Continue{stage.selected ? ` with ${opLabel(stage.selected)}` : ""}
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
