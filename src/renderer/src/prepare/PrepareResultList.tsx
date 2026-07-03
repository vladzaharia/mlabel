import { CheckCircle2, Folder } from "lucide-react";
import { Button } from "../components/ui/button";
import { baseName, isMac } from "../lib/utils";

export function PrepareResultList({
  title,
  files,
  summary,
}: {
  title: string;
  files: readonly { path: string; rowCount?: number }[];
  summary?: string;
}): React.JSX.Element {
  const revealLabel = isMac() ? "Show in Finder" : "Show in File Explorer";

  return (
    <div className="space-y-2 rounded-lg border border-progress/30 bg-progress/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-progress-text">
          <CheckCircle2 size={14} aria-hidden="true" />
          {title}
        </span>
        {summary && <span className="text-xs tabular-nums text-muted-foreground">{summary}</span>}
      </div>
      <div className="space-y-1.5">
        {files.map((file) => (
          <div
            key={file.path}
            className="flex flex-col gap-2 rounded-md bg-background/40 px-2.5 py-2 text-xs sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1 truncate font-medium" title={file.path}>
              {baseName(file.path)}
            </span>
            {file.rowCount !== undefined && (
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {file.rowCount} row{file.rowCount === 1 ? "" : "s"}
              </span>
            )}
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0 self-start text-muted-foreground hover:text-foreground sm:self-auto"
              onClick={() => window.api.revealPath(file.path).catch(console.error)}
            >
              <Folder size={12} aria-hidden="true" />
              {revealLabel}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
