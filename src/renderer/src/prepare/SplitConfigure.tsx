import { Loader2, Minus, Plus, Scissors } from "lucide-react";
import { chunkSizes } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { FileStatusRow } from "./FileStatusRow";
import { ChunkMap } from "./ChunkMap";
import { ConfigureHeader, Eyebrow } from "./ConfigureHeader";
import { PrepareResultList } from "./PrepareResultList";

export function SplitConfigure(): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const split = usePrepareStore((s) => s.split);
  const setSplitParts = usePrepareStore((s) => s.setSplitParts);
  const runSplit = usePrepareStore((s) => s.runSplit);

  const { file, parts, result } = split;
  const canSplit =
    Boolean(file?.ok) && (file?.rowCount ?? 0) >= 2 && parts <= (file?.rowCount ?? 0);
  const sizes = file && canSplit ? chunkSizes(file.rowCount, parts) : undefined;

  return (
    <div>
      <ConfigureHeader op="split" />
      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
            {error}
          </div>
        )}

        {file && (
          <>
            <div className="space-y-2">
              <Eyebrow>Source</Eyebrow>
              <FileStatusRow file={file} />
            </div>

            <div className="space-y-2">
              <Eyebrow>Partition</Eyebrow>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {file.rowCount} row{file.rowCount === 1 ? "" : "s"} → {parts} contiguous part
                    file{parts === 1 ? "" : "s"}, written next to the source.
                  </p>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Fewer files"
                      disabled={busy || parts <= 2}
                      onClick={() => setSplitParts(parts - 1)}
                    >
                      <Minus size={13} />
                    </Button>
                    <input
                      type="number"
                      min={2}
                      max={file.rowCount}
                      value={parts}
                      aria-label="Number of split files"
                      disabled={busy}
                      onChange={(event) => setSplitParts(Number(event.currentTarget.value))}
                      className="h-8 w-16 rounded-md border border-border bg-background/50 px-2 text-center text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
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
                </div>
                {sizes && <ChunkMap sourcePath={file.path} sizes={sizes} />}
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={busy || !canSplit} onClick={() => void runSplit()}>
                {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
                <Scissors size={14} aria-hidden="true" /> Split into {parts} files
              </Button>
            </div>

            {result && !result.ok && result.error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
                {result.error}
              </div>
            )}
            {result?.ok && result.files && (
              <PrepareResultList
                title="Split complete"
                files={result.files}
                summary={`${String(result.files.length)} file${
                  result.files.length === 1 ? "" : "s"
                }`}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
