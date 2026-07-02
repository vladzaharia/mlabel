import { CheckCircle2, FileDown, Folder, Loader2, PartyPopper } from "lucide-react";
import { useStore } from "../store/store";
import { Button } from "../components/ui/button";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { baseName, isMac } from "../lib/utils";

export function DoneScreen(): React.JSX.Element {
  const result = useStore((s) => s.exportResult);
  const pickInput = useStore((s) => s.pickInput);
  const backToLabeling = useStore((s) => s.backToLabeling);
  const busy = useStore((s) => s.busy);
  const headingRef = useHeadingFocus();

  const complete = result?.completeCount ?? 0;
  const remaining = result?.remainingCount ?? 0;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass-card flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-progress/30 p-10 text-center shadow-xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-progress/15 text-progress">
          <PartyPopper size={30} />
        </div>

        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            Nice work — you’re done!
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Your labels have been exported.</p>
        </div>

        <div className="w-full space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-left text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-progress-text" />
            <span className="font-medium text-progress-text">{complete}</span>
            <span className="text-muted-foreground">
              record{complete === 1 ? "" : "s"} exported
            </span>
          </div>
          {remaining > 0 && (
            <div className="flex items-center gap-2">
              <FileDown size={16} className="text-warning-text" />
              <span className="font-medium text-warning-text">{remaining}</span>
              <span className="text-muted-foreground">
                incomplete record{remaining === 1 ? "" : "s"} saved to the remaining file
              </span>
            </div>
          )}
        </div>

        {result?.outputPath && <RevealRow path={result.outputPath} />}
        {result?.remainingPath && <RevealRow path={result.remainingPath} />}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={backToLabeling}>
            Keep editing
          </Button>
          <Button variant="success" disabled={busy} onClick={() => void pickInput()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Label another file
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One output file row: filename + full path tooltip + OS reveal button. */
function RevealRow({ path }: { path: string }): React.JSX.Element {
  const revealLabel = isMac() ? "Show in Finder" : "Show in File Explorer";
  return (
    <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="min-w-0 truncate font-medium" title={path}>
        {baseName(path)}
      </span>
      <Button
        variant="ghost"
        size="xs"
        className="shrink-0"
        onClick={() => window.api.revealPath(path).catch(console.error)}
      >
        <Folder size={12} />
        {revealLabel}
      </Button>
    </div>
  );
}
