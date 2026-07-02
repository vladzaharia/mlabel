import { CheckCircle2, Combine, Loader2, Plus } from "lucide-react";
import type { JoinKind } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { CardShell } from "../components/CardShell";
import { IssueList } from "../components/IssueList";
import { FileStatusRow } from "./FileStatusRow";

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

const COPY: Record<JoinKind, { title: string; description: string; help: string }> = {
  output: {
    title: "Join output files",
    description: "Combine labeled *-output files into one result.",
    help: "Each file's columns must match the output schema exactly, and every row must be a complete, valid label. Duplicate rows are flagged before joining.",
  },
  remaining: {
    title: "Join remaining files",
    description: "Combine *-remaining files into one input you can re-split or label.",
    help: "Each file's columns must match the input schema exactly. The joined file works anywhere an input file does — label it directly or split it again.",
  },
};

export function JoinPanel({ kind }: { kind: JoinKind }): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const join = usePrepareStore((s) => s.join[kind]);
  const pickJoinFiles = usePrepareStore((s) => s.pickJoinFiles);
  const removeJoinFile = usePrepareStore((s) => s.removeJoinFile);
  const runJoin = usePrepareStore((s) => s.runJoin);

  const { files, crossFileIssues, totalRows, result } = join;
  const duplicateCount = crossFileIssues.filter((i) => i.kind === "duplicate").length;
  const blocked =
    files.length === 0 ||
    files.some((f) => !f.ok) ||
    crossFileIssues.some((i) => i.severity === "error");

  return (
    <CardShell
      displayName={COPY[kind].title}
      description={COPY[kind].description}
      help={COPY[kind].help}
    >
      {files.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-4">
          <Button variant="outline" disabled={busy} onClick={() => void pickJoinFiles(kind)}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Select files…
          </Button>
          <p className="text-muted-foreground text-xs">…or drop files onto the window.</p>
        </div>
      )}

      {error && <p className="text-xs text-danger-text">{error}</p>}

      {files.length > 0 && (
        <>
          <div className="space-y-2">
            {files.map((file) => (
              <FileStatusRow
                key={file.path}
                file={file}
                onRemove={() => void removeJoinFile(kind, file.path)}
              />
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void pickJoinFiles(kind)}
          >
            <Plus size={14} /> Add files…
          </Button>

          {crossFileIssues.length > 0 && <IssueList issues={crossFileIssues} />}

          <p className="text-muted-foreground text-xs">
            {files.length} file{files.length === 1 ? "" : "s"} · {totalRows} row
            {totalRows === 1 ? "" : "s"}
            {duplicateCount > 0 && (
              <span className="text-warning-text">
                {" "}
                · {duplicateCount} duplicate row{duplicateCount === 1 ? "" : "s"}
              </span>
            )}
          </p>

          <Button disabled={busy || blocked} onClick={() => void runJoin(kind)}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            <Combine size={14} /> Join {files.length} file{files.length === 1 ? "" : "s"}…
          </Button>

          {result && !result.ok && !result.canceled && (
            <p className="text-xs text-danger-text">{result.error}</p>
          )}
          {result?.ok && result.path && (
            <div className="flex items-center gap-2 rounded-lg border border-progress/30 bg-progress/5 p-3 text-xs">
              <CheckCircle2 size={13} className="text-progress-text shrink-0" />
              <span className="min-w-0 flex-1 truncate" title={result.path}>
                {baseName(result.path)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </>
      )}
    </CardShell>
  );
}
