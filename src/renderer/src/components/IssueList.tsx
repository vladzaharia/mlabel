import type { ValidationIssue } from "@core";

/** Severity-colored list of validation issues (header/coercion/schema). */
export function IssueList({ issues }: { issues: readonly ValidationIssue[] }): React.JSX.Element {
  return (
    <ul className="max-h-72 space-y-1.5 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-sm">
      {issues.map((issue, i) => (
        <li key={`${issue.field ?? ""}-${i}`} className="text-xs">
          <span className={issue.severity === "error" ? "text-danger" : "text-warning"}>
            {issue.severity}
          </span>
          {issue.recordIndex !== undefined ? ` · row ${issue.recordIndex + 1}` : ""}
          {issue.field ? ` · ${issue.field}` : ""} — {issue.message}
        </li>
      ))}
    </ul>
  );
}
