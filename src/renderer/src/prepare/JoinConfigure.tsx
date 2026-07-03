import { Combine, Loader2, Plus } from "lucide-react";
import type { JoinKind } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { IssueList } from "../components/IssueList";
import { FileStatusRow } from "./FileStatusRow";
import { ConfigureHeader, Eyebrow } from "./ConfigureHeader";
import { PrepareResultList } from "./PrepareResultList";

export function JoinConfigure({ kind }: { kind: JoinKind }): React.JSX.Element {
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
    <div>
      <ConfigureHeader op={kind === "output" ? "join-output" : "join-remaining"} />
      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow>Files</Eyebrow>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void pickJoinFiles(kind)}
            >
              <Plus size={14} aria-hidden="true" /> Add files…
            </Button>
          </div>
          <div className="space-y-2">
            {files.map((file) => (
              <FileStatusRow
                key={file.path}
                file={file}
                onRemove={() => void removeJoinFile(kind, file.path)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Eyebrow>Validation</Eyebrow>
          {crossFileIssues.length > 0 && <IssueList issues={crossFileIssues} />}
          <div className="grid gap-2 sm:grid-cols-3">
            <StatPill
              label="Files"
              value={`${String(files.length)} file${files.length === 1 ? "" : "s"}`}
            />
            <StatPill
              label="Rows"
              value={`${String(totalRows)} row${totalRows === 1 ? "" : "s"}`}
            />
            <StatPill
              label="Duplicates"
              value={`${String(duplicateCount)} row${duplicateCount === 1 ? "" : "s"}`}
              tone={duplicateCount > 0 ? "warning" : "default"}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button disabled={busy || blocked} onClick={() => void runJoin(kind)}>
            {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
            <Combine size={14} aria-hidden="true" /> Join {files.length} file
            {files.length === 1 ? "" : "s"}…
          </Button>
        </div>

        {result && !result.ok && !result.canceled && result.error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {result.error}
          </div>
        )}
        {result?.ok && result.path && (
          <PrepareResultList
            title="Join complete"
            files={[{ path: result.path, rowCount: result.rowCount }]}
            summary={`${String(result.rowCount ?? 0)} row${result.rowCount === 1 ? "" : "s"}${
              (result.duplicateCount ?? 0) > 0
                ? ` · ${String(result.duplicateCount)} duplicate${
                    result.duplicateCount === 1 ? "" : "s"
                  }`
                : ""
            }`}
          />
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
}): React.JSX.Element {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
          : "rounded-lg border border-border bg-muted/30 px-3 py-2"
      }
    >
      <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
      <p className={tone === "warning" ? "mt-0.5 text-sm text-warning-text" : "mt-0.5 text-sm"}>
        {value}
      </p>
    </div>
  );
}
