import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { ModelCallEntry, ModelCallStatus } from "@core";
import { Button } from "../components/ui/button";
import { SEVERITY, type SeverityKind } from "../components/Severity";
import { Empty, Eyebrow } from "./SettingsSection";
import { cn } from "../lib/utils";

/**
 * What the model was actually asked, and what it actually said.
 *
 * The counterpart to the network log, and there for the same reason. The
 * callout above tells a labeler the results may be wrong and to verify them;
 * that instruction is only followable if they can see the whole prompt — the
 * two failure modes this feature really has are a value truncated out of the
 * prompt and an `ai.context` that led the model somewhere, and neither is
 * visible from the finding alone.
 */

const STATUS_TONE: Record<ModelCallStatus, SeverityKind> = {
  running: "muted",
  clean: "success",
  findings: "warning",
  failed: "danger",
  canceled: "muted",
};

const STATUS_LABEL: Record<ModelCallStatus, string> = {
  running: "Running…",
  clean: "Nothing found",
  failed: "Failed",
  canceled: "Canceled",
  findings: "",
};

const describe = (entry: ModelCallEntry): string =>
  entry.status === "findings"
    ? entry.findings.length === 1
      ? "1 note"
      : `${String(entry.findings.length)} notes`
    : STATUS_LABEL[entry.status];

const time = (at: number): string => new Date(at).toLocaleTimeString();
const ms = (value?: number): string =>
  value === undefined ? "" : `${String(Math.round(value))}ms`;

/** One labelled slab of monospace, for the parts of a call worth reading in full. */
function Block({ label, children }: { label: string; children: string }): React.JSX.Element {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {children}
      </pre>
    </div>
  );
}

function Detail({
  entry,
  onBack,
}: {
  entry: ModelCallEntry;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="xs" variant="ghost" onClick={onBack}>
          <ChevronLeft size={12} aria-hidden="true" />
          All calls
        </Button>
        <span className="text-sm font-medium">Record {entry.recordIndex + 1}</span>
        <span className={cn("text-xs", SEVERITY[STATUS_TONE[entry.status]].textClass)}>
          {describe(entry)}
        </span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {entry.modelId} · {time(entry.at)}
          {entry.elapsedMs !== undefined && ` · ${ms(entry.elapsedMs)}`}
        </span>
      </div>

      {entry.error !== undefined && (
        <p className={cn("text-xs", SEVERITY.danger.textClass)}>{entry.error}</p>
      )}

      {entry.findings.length > 0 && (
        <div>
          <Eyebrow>Notes shown</Eyebrow>
          <ul className="mt-1 flex flex-col gap-1">
            {entry.findings.map((finding, i) => (
              <li key={i} className="text-xs">
                <span className="text-muted-foreground">
                  {finding.field ?? finding.card ?? "this record"}:
                </span>{" "}
                {finding.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The record first: it is the part that changes, and the part a labeler
          is checking a note against. The instructions are identical on every
          call and mostly of interest once. */}
      <Block label="The record, as the model saw it">{entry.suffix}</Block>
      <Block label="Instructions">{entry.prefix}</Block>
      {entry.raw !== undefined && <Block label="Raw reply">{entry.raw}</Block>}
    </div>
  );
}

export function ModelCalls({ entries }: { entries: readonly ModelCallEntry[] }): React.JSX.Element {
  const [openId, setOpenId] = useState<number | null>(null);
  const open = entries.find((entry) => entry.id === openId);

  if (open) return <Detail entry={open} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Eyebrow>Recent runs</Eyebrow>
        <span className="text-[11px] text-muted-foreground">this session · last 20</span>
      </div>
      {entries.length === 0 ? (
        <Empty>Nothing yet. Runs appear here as records are read.</Empty>
      ) : (
        <ul className="mt-1 divide-y divide-border/50 overflow-hidden rounded-lg border border-border">
          {entries.toReversed().map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => setOpenId(entry.id)}
                className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="w-20 shrink-0 tabular-nums">Record {entry.recordIndex + 1}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    SEVERITY[STATUS_TONE[entry.status]].textClass,
                  )}
                >
                  {describe(entry)}
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                  {ms(entry.elapsedMs)}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {time(entry.at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
