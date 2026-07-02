import { AlertTriangle, CheckCircle2, FileSpreadsheet, X } from "lucide-react";
import type { PrepareFileInfo } from "@core";
import { Button } from "../components/ui/button";
import { IssueList } from "../components/IssueList";

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

/** One analyzed file: name, row count, validation status, optional remove. */
export function FileStatusRow({
  file,
  onRemove,
}: {
  file: PrepareFileInfo;
  onRemove?: () => void;
}): React.JSX.Element {
  const errors = file.issues.filter((i) => i.severity === "error").length;
  const warnings = file.issues.length - errors;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2">
        <FileSpreadsheet size={15} className="text-muted-foreground shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm" title={file.path}>
          {baseName(file.path)}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {file.rowCount} row{file.rowCount === 1 ? "" : "s"}
        </span>
        {file.ok ? (
          warnings > 0 ? (
            <span className="flex shrink-0 items-center gap-1 text-xs text-warning">
              <AlertTriangle size={13} /> {warnings} warning{warnings === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-xs text-progress">
              <CheckCircle2 size={13} /> Valid
            </span>
          )
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs text-danger">
            <AlertTriangle size={13} /> {errors} error{errors === 1 ? "" : "s"}
          </span>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${baseName(file.path)}`}
            onClick={onRemove}
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </Button>
        )}
      </div>
      {file.issues.length > 0 && <IssueList issues={file.issues} />}
    </div>
  );
}
