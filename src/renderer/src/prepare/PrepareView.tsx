import type { AppConfig } from "@core";
import { useStore } from "../store/store";
import { usePrepareStore } from "../store/prepare-store";
import { IdleStage } from "./IdleStage";
import { ConfirmStage } from "./ConfirmStage";
import { SplitConfigure } from "./SplitConfigure";
import { JoinConfigure } from "./JoinConfigure";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

/**
 * Prepare mode, drop-first: files land anywhere on the card, MLabel proposes
 * the operation (Confirm stage), the user approves, then configures and runs.
 */
export function PrepareView(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const stage = usePrepareStore((s) => s.stage);
  const dropPaths = usePrepareStore((s) => s.dropPaths);
  const headingRef = useHeadingFocus();

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const paths = [...event.dataTransfer.files].map((file) => window.api.pathForFile(file));
    void dropPaths(paths);
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-5 pb-8 pt-2 sm:px-6">
        <header className="min-w-0">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight outline-none"
          >
            Prepare data
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Split a source file into parts for your labelers, or merge their finished work back
            together.
          </p>
        </header>

        <section
          aria-label="Prepare workspace"
          className="glass-card overflow-hidden rounded-xl border border-border shadow-sm"
        >
          {stage.kind === "idle" && <IdleStage />}
          {stage.kind === "confirm" && <ConfirmStage stage={stage} />}
          {stage.kind === "configure" && stage.op === "split" && <SplitConfigure />}
          {stage.kind === "configure" && stage.op === "join-output" && (
            <JoinConfigure kind="output" />
          )}
          {stage.kind === "configure" && stage.op === "join-remaining" && (
            <JoinConfigure kind="remaining" />
          )}
          <ContractFooter config={config} />
        </section>
      </div>
    </div>
  );
}

function ContractFooter({ config }: { config: AppConfig | null }): React.JSX.Element {
  const inputFields = config?.input.fields ?? [];
  const outputFields = config?.output.fields ?? [];
  return (
    <details className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2">
        <span>
          Data contract · {inputFields.length} input field{inputFields.length === 1 ? "" : "s"} →{" "}
          {outputFields.length} output field{outputFields.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-md border border-border px-1.5 py-0.5">Details</span>
      </summary>
      <div className="mt-2 grid gap-2 pb-1 md:grid-cols-2">
        <div className="min-w-0 rounded-md bg-background/35 p-2">
          <p className="font-medium text-foreground">Input schema</p>
          <p className="mt-1 max-h-20 overflow-auto break-words">
            {inputFields.map((f) => f.name).join(", ") || "None"}
          </p>
        </div>
        <div className="min-w-0 rounded-md bg-background/35 p-2">
          <p className="font-medium text-foreground">Output schema</p>
          <p className="mt-1 max-h-20 overflow-auto break-words">
            {outputFields.map((f) => f.name).join(", ") || "None"}
          </p>
        </div>
      </div>
    </details>
  );
}
