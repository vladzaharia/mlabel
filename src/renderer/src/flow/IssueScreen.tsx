import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useStore } from "../store/store";
import { Button } from "../components/ui/button";
import { IssueList } from "../components/IssueList";

/** Shared chrome for the "something is wrong with this file" screens. */
function IssueShell({
  title,
  subtitle,
  children,
  actionLabel,
  onAction,
  busy,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
  busy: boolean;
}): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass-card flex w-full max-w-xl flex-col gap-4 rounded-2xl border border-border p-8 shadow-xl">
        <div className="flex items-center gap-3 text-danger">
          <AlertTriangle size={20} />
          <h1 className="text-base font-semibold">{title}</h1>
        </div>
        {subtitle && <p className="text-muted-foreground -mt-2 truncate text-xs">{subtitle}</p>}
        {children}
        <Button variant="outline" disabled={busy} onClick={onAction}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

export function ConfigIssueScreen(): React.JSX.Element {
  const issues = useStore((s) => s.configIssues);
  const configPath = useStore((s) => s.configPath);
  const pickConfig = useStore((s) => s.pickConfig);
  const busy = useStore((s) => s.busy);

  return (
    <IssueShell
      title="This config isn’t valid"
      subtitle={configPath ?? undefined}
      actionLabel="Choose a different config…"
      onAction={() => void pickConfig()}
      busy={busy}
    >
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
    </IssueShell>
  );
}

export function InputIssueScreen(): React.JSX.Element {
  const issues = useStore((s) => s.headerIssues);
  const error = useStore((s) => s.error);
  const pickInput = useStore((s) => s.pickInput);
  const busy = useStore((s) => s.busy);

  return (
    <IssueShell
      title={error ?? "This input file can’t be used"}
      actionLabel="Choose a different file…"
      onAction={() => void pickInput()}
      busy={busy}
    >
      <IssueList issues={issues} />
    </IssueShell>
  );
}
