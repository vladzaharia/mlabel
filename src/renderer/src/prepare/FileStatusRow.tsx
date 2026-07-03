import { FileSpreadsheet, X } from "lucide-react";
import type { PrepareFileInfo } from "@core";
import { Button } from "../components/ui/button";
import { IssueList } from "../components/IssueList";
import { SEVERITY } from "../components/Severity";
import { baseName, cn } from "../lib/utils";

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
  const severity = file.ok ? (warnings > 0 ? SEVERITY.warning : SEVERITY.success) : SEVERITY.error;
  const StatusIcon = severity.Icon;
  const statusText = file.ok
    ? warnings > 0
      ? `${String(warnings)} warning${warnings === 1 ? "" : "s"}`
      : "Valid"
    : `${String(errors)} error${errors === 1 ? "" : "s"}`;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg border px-3 py-2.5 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)_auto]",
          file.ok
            ? warnings > 0
              ? "border-warning/30 bg-warning/5"
              : "border-progress/30 bg-progress/5"
            : "border-danger/30 bg-danger/5",
        )}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/55">
          <FileSpreadsheet
            size={16}
            aria-hidden="true"
            className="text-muted-foreground shrink-0"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={file.path}>
            {baseName(file.path)}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={file.path}>
            {file.path}
          </p>
        </div>
        <div className="col-span-2 flex shrink-0 flex-wrap items-center gap-2 sm:col-span-1 sm:justify-end">
          <span className="rounded-md bg-background/55 px-2 py-1 text-xs tabular-nums text-muted-foreground">
            {file.rowCount} row{file.rowCount === 1 ? "" : "s"}
          </span>
          <span
            className={cn(
              "flex min-w-20 items-center justify-center gap-1 rounded-md bg-background/55 px-2 py-1 text-xs",
              severity.textClass,
            )}
          >
            <StatusIcon size={13} aria-hidden="true" /> {statusText}
          </span>
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
      </div>
      {file.issues.length > 0 && <IssueList issues={file.issues} />}
    </div>
  );
}
