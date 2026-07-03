import { Loader2, Minus, Plus, Scissors } from "lucide-react";
import { chunkSizes } from "@core";
import { usePrepareStore } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { FileStatusRow } from "./FileStatusRow";
import { PrepareOperationPanel, PrepareSection } from "./PrepareOperationPanel";
import { PrepareResultList } from "./PrepareResultList";

export function SplitPanel(): React.JSX.Element {
  const busy = usePrepareStore((s) => s.busy);
  const error = usePrepareStore((s) => s.error);
  const split = usePrepareStore((s) => s.split);
  const clearSplitFile = usePrepareStore((s) => s.clearSplitFile);
  const setSplitParts = usePrepareStore((s) => s.setSplitParts);
  const runSplit = usePrepareStore((s) => s.runSplit);

  const { file, parts, result } = split;
  const canSplit =
    Boolean(file?.ok) && (file?.rowCount ?? 0) >= 2 && parts <= (file?.rowCount ?? 0);
  const sizes = file && canSplit ? chunkSizes(file.rowCount, parts) : undefined;
  const preview = sizes ? sizes.join(", ") : undefined;

  return (
    <PrepareOperationPanel
      title="Split an input file"
      description="Divide one input into contiguous parts to hand out to labelers."
      Icon={Scissors}
    >
      {!file && <EmptySplitState />}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
          {error}
        </div>
      )}

      {file && (
        <>
          <PrepareSection eyebrow="Step 1" title="Source file">
            <FileStatusRow file={file} onRemove={clearSplitFile} />
          </PrepareSection>

          <PrepareSection eyebrow="Step 2" title="Partition">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Split into files</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Contiguous chunks written next to the source file.
                  </p>
                </div>
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
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-background/45 px-2 py-1 tabular-nums text-muted-foreground">
                  {file.rowCount} source row{file.rowCount === 1 ? "" : "s"}
                </span>
                {preview && (
                  <span className="rounded-md bg-background/45 px-2 py-1 tabular-nums text-muted-foreground">
                    {preview} rows per file
                  </span>
                )}
              </div>
              {sizes && <DistributionBar sizes={sizes} />}
            </div>
          </PrepareSection>

          <PrepareSection eyebrow="Step 3" title="Create part files">
            <div className="flex justify-end">
              <Button disabled={busy || !canSplit} onClick={() => void runSplit()}>
                {busy && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
                <Scissors size={14} aria-hidden="true" /> Split into {parts} files
              </Button>
            </div>
          </PrepareSection>

          {result && !result.ok && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text">
              {result.error}
            </div>
          )}
          {result?.ok && result.files && (
            <PrepareResultList
              title="Split complete"
              files={result.files}
              summary={`${String(result.files.length)} file${result.files.length === 1 ? "" : "s"}`}
            />
          )}
        </>
      )}
    </PrepareOperationPanel>
  );
}

function DistributionBar({ sizes }: { sizes: readonly number[] }): React.JSX.Element {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return (
    <div className="mt-4 flex h-8 overflow-hidden rounded-md border border-border bg-background/40">
      {sizes.map((size, index) => (
        <div
          key={index}
          className="flex min-w-8 items-center justify-center border-r border-border/70 bg-accent/15 px-2 text-[11px] font-medium tabular-nums text-accent last:border-r-0"
          style={{ flexGrow: size, flexBasis: `${String((size / total) * 100)}%` }}
          title={`Part ${String(index + 1)}: ${String(size)} row${size === 1 ? "" : "s"}`}
        >
          {size}
        </div>
      ))}
    </div>
  );
}

function EmptySplitState(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-muted/25 px-4 py-3">
      <p className="text-sm font-medium">No source file selected</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Drop a source file in the drop zone above, or select Split source to browse.
      </p>
    </div>
  );
}
