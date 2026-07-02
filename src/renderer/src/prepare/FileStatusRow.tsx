import { FileSpreadsheet, X } from "lucide-react";
import type { PrepareFileInfo } from "@core";
import { Button } from "../components/ui/button";
import { IssueList } from "../components/IssueList";
import { SEVERITY } from "../components/Severity";
import { baseName } from "../lib/utils";

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
        <FileSpreadsheet size={15} aria-hidden="true" className="text-muted-foreground shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm" title={file.path}>
          {baseName(file.path)}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {file.rowCount} row{file.rowCount === 1 ? "" : "s"}
        </span>
        {file.ok ? (
          warnings > 0 ? (
            <span
              className={`flex shrink-0 items-center gap-1 text-xs ${SEVERITY.warning.textClass}`}
            >
              <SEVERITY.warning.Icon size={13} aria-hidden="true" /> {warnings} warning
              {warnings === 1 ? "" : "s"}
            </span>
          ) : (
            <span
              className={`flex shrink-0 items-center gap-1 text-xs ${SEVERITY.success.textClass}`}
            >
              <SEVERITY.success.Icon size={13} aria-hidden="true" /> Valid
            </span>
          )
        ) : (
          <span className={`flex shrink-0 items-center gap-1 text-xs ${SEVERITY.error.textClass}`}>
            <SEVERITY.error.Icon size={13} aria-hidden="true" /> {errors} error
            {errors === 1 ? "" : "s"}
          </span>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${baseName(file.path)}`}
            onClick={onRemove}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X size={13} aria-hidden="true" />
          </Button>
        )}
      </div>
      {file.issues.length > 0 && <IssueList issues={file.issues} />}
    </div>
  );
}
