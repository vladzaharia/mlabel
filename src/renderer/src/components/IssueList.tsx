import type { ValidationIssue } from "@core";
import { SEVERITY, type SeverityKind } from "./Severity";

/** Severity-colored list of validation issues (header/coercion/schema). */
export function IssueList({ issues }: { issues: readonly ValidationIssue[] }): React.JSX.Element {
  return (
    <ul className="max-h-72 space-y-1.5 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-sm">
      {issues.map((issue, i) => {
        const { Icon, textClass } = SEVERITY[issue.severity as SeverityKind] ?? SEVERITY.info;
        return (
          <li key={`${issue.field ?? ""}-${i}`} className="flex items-start gap-1.5 text-xs">
            <Icon size={12} className={`mt-0.5 shrink-0 ${textClass}`} />
            <span>
              <span className={textClass}>{issue.severity}</span>
              {issue.recordIndex !== undefined ? ` · row ${issue.recordIndex + 1}` : ""}
              {issue.field ? ` · ${issue.field}` : ""} — {issue.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
