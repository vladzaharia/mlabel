import { AlertTriangle } from "lucide-react";
import { useStore } from "../store/store";
import { Button } from "../components/ui/button";

export function ConfigIssueScreen(): React.JSX.Element {
  const issues = useStore((s) => s.configIssues);
  const configPath = useStore((s) => s.configPath);
  const pickConfig = useStore((s) => s.pickConfig);
  const busy = useStore((s) => s.busy);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass-card flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-border p-8 shadow-xl">
        <div className="flex items-center gap-3 text-danger">
          <AlertTriangle size={20} />
          <h1 className="text-base font-semibold">This config isn’t valid</h1>
        </div>
        {configPath && <p className="text-muted-foreground -mt-2 truncate text-xs">{configPath}</p>}
        <ul className="max-h-72 space-y-1.5 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {issues.map((issue, i) => (
            <li key={`${issue.path ?? ""}-${i}`} className="font-mono text-xs">
              {issue.path && <span className="text-accent">{issue.path}: </span>}
              {issue.message}
              {issue.line !== undefined && (
                <span className="text-muted-foreground"> (line {issue.line})</span>
              )}
            </li>
          ))}
        </ul>
        <Button variant="outline" disabled={busy} onClick={() => void pickConfig()}>
          Choose a different config…
        </Button>
      </div>
    </div>
  );
}

export function InputIssueScreen(): React.JSX.Element {
  const issues = useStore((s) => s.headerIssues);
  const error = useStore((s) => s.error);
  const pickInput = useStore((s) => s.pickInput);
  const busy = useStore((s) => s.busy);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass-card flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-border p-8 shadow-xl">
        <div className="flex items-center gap-3 text-danger">
          <AlertTriangle size={20} />
          <h1 className="text-base font-semibold">{error ?? "This input file can’t be used"}</h1>
        </div>
        <ul className="max-h-72 space-y-1.5 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-sm">
          {issues.map((issue, i) => (
            <li key={`${issue.field ?? ""}-${i}`} className="text-xs">
              <span className={issue.severity === "error" ? "text-danger" : "text-warning"}>
                {issue.severity}
              </span>
              {issue.field ? ` · ${issue.field}` : ""} — {issue.message}
            </li>
          ))}
        </ul>
        <Button variant="outline" disabled={busy} onClick={() => void pickInput()}>
          Choose a different file…
        </Button>
      </div>
    </div>
  );
}
