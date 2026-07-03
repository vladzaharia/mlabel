import { useStore } from "../store/store";
import { usePrepareStore } from "../store/prepare-store";
import { SplitPanel } from "./SplitPanel";
import { JoinPanel } from "./JoinPanel";
import { PrepareDropSurface } from "./PrepareDropSurface";
import { PrepareTaskMap } from "./PrepareTaskMap";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

/** Prepare mode: split one input into parts, or join output/remaining files. */
export function PrepareView(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const tab = usePrepareStore((s) => s.tab);
  const selectedAction = usePrepareStore((s) => s.selectedAction);
  const headingRef = useHeadingFocus();

  const inputColumns = config?.input.fields.map((f) => f.name).join(", ") ?? "";
  const outputColumns = config?.output.fields.map((f) => f.name).join(", ") ?? "";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 pb-8 pt-2 sm:px-6">
        <header className="flex flex-col gap-2">
          <div className="min-w-0">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold tracking-tight outline-none"
            >
              Prepare data
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Split source files or merge prepared labeling results.
            </p>
          </div>
        </header>

        <PrepareTaskMap />
        <PrepareDropSurface />
        <DataContract
          inputColumns={inputColumns}
          inputCount={config?.input.fields.length ?? 0}
          outputColumns={outputColumns}
          outputCount={config?.output.fields.length ?? 0}
        />

        {selectedAction === null && <NoActionSelected />}
        {selectedAction !== null && tab === "split" && <SplitPanel />}
        {selectedAction !== null && tab === "join-output" && <JoinPanel kind="output" />}
        {selectedAction !== null && tab === "join-remaining" && <JoinPanel kind="remaining" />}
      </div>
    </div>
  );
}

function NoActionSelected(): React.JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      Drop files to auto-detect the operation, or choose an action above to browse for files.
    </div>
  );
}

function DataContract({
  inputColumns,
  inputCount,
  outputColumns,
  outputCount,
}: {
  inputColumns: string;
  inputCount: number;
  outputColumns: string;
  outputCount: number;
}): React.JSX.Element {
  return (
    <details className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <summary className="select-none font-medium text-foreground">
        Data contract: Input schema {inputCount} field{inputCount === 1 ? "" : "s"} · Output schema{" "}
        {outputCount} field{outputCount === 1 ? "" : "s"}
      </summary>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="min-w-0 rounded-md bg-background/35 p-2">
          <p className="font-medium text-foreground">Input schema</p>
          <p className="mt-1 max-h-20 overflow-auto break-words">{inputColumns || "None"}</p>
        </div>
        <div className="min-w-0 rounded-md bg-background/35 p-2">
          <p className="font-medium text-foreground">Output schema</p>
          <p className="mt-1 max-h-20 overflow-auto break-words">{outputColumns || "None"}</p>
        </div>
      </div>
    </details>
  );
}
