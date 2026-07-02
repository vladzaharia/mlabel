import { CheckCircle2, Loader2, Minus, Plus, Scissors } from "lucide-react";
import { chunkSizes } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { CardShell } from "../components/CardShell";
import { FileStatusRow } from "./FileStatusRow";

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function SplitPanel(): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const split = usePrepareStore((s) => s.split);
  const pickSplitFile = usePrepareStore((s) => s.pickSplitFile);
  const clearSplitFile = usePrepareStore((s) => s.clearSplitFile);
  const setSplitParts = usePrepareStore((s) => s.setSplitParts);
  const runSplit = usePrepareStore((s) => s.runSplit);

  const { file, parts, result } = split;
  const canSplit =
    Boolean(file?.ok) && (file?.rowCount ?? 0) >= 2 && parts <= (file?.rowCount ?? 0);
  const preview = file && canSplit ? chunkSizes(file.rowCount, parts).join(", ") : undefined;

  return (
    <CardShell
      displayName="Split an input file"
      description="Divide one input into contiguous parts to hand out to labelers."
      help="The file is validated against the input schema first. Parts are written next to the source as name-part1-of-N; rows keep their original order and formatting."
    >
      {!file && (
        <div className="flex flex-col items-center gap-3 py-4">
          <Button variant="outline" disabled={busy} onClick={() => void pickSplitFile()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Select input file…
          </Button>
          <p className="text-muted-foreground text-xs">…or drop a file onto the window.</p>
        </div>
      )}

      {error && <p className="text-xs text-danger-text">{error}</p>}

      {file && (
        <>
          <FileStatusRow file={file} onRemove={clearSplitFile} />

          <div className="flex items-center gap-3">
            <span className="text-sm">Split into</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Fewer files"
                disabled={busy || parts <= 2}
                onClick={() => setSplitParts(parts - 1)}
              >
                <Minus size={13} />
              </Button>
              <span className="w-8 text-center text-sm font-medium tabular-nums">{parts}</span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More files"
                disabled={busy || parts >= file.rowCount}
                onClick={() => setSplitParts(parts + 1)}
              >
                <Plus size={13} />
              </Button>
            </div>
            <span className="text-sm">files</span>
            {preview && (
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {preview} rows per file
              </span>
            )}
          </div>

          <Button disabled={busy || !canSplit} onClick={() => void runSplit()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            <Scissors size={14} /> Split into {parts} files
          </Button>

          {result && !result.ok && <p className="text-xs text-danger-text">{result.error}</p>}
          {result?.ok && result.files && (
            <div className="space-y-1.5 rounded-lg border border-progress/30 bg-progress/5 p-3">
              {result.files.map((f) => (
                <div key={f.path} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 size={13} className="text-progress-text shrink-0" />
                  <span className="min-w-0 flex-1 truncate" title={f.path}>
                    {baseName(f.path)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {f.rowCount} row{f.rowCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </CardShell>
  );
}
