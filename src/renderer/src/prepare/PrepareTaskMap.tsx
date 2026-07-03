import { FileCheck2, Scissors, SplitSquareVertical } from "lucide-react";
import type { PrepareTab } from "../store/prepare-store";
import { usePrepareStore } from "../store/prepare-store";
import { cn } from "../lib/utils";

const MODES: {
  id: PrepareTab;
  label: string;
  description: string;
  Icon: typeof Scissors;
}[] = [
  {
    id: "split",
    label: "Split source",
    description: "Create part files.",
    Icon: Scissors,
  },
  {
    id: "join-output",
    label: "Join outputs",
    description: "Merge labeled files.",
    Icon: FileCheck2,
  },
  {
    id: "join-remaining",
    label: "Join remaining",
    description: "Merge unfinished rows.",
    Icon: SplitSquareVertical,
  },
];

function modeState(tab: PrepareTab): string | null {
  const state = usePrepareStore.getState();
  if (tab === "split") {
    if (state.split.result?.ok) return "Complete";
    if (state.split.file && !state.split.file.ok) return "Blocked";
    if (state.split.file?.ok) return "Ready";
    return null;
  }

  const kind = tab === "join-output" ? "output" : "remaining";
  const join = state.join[kind];
  if (join.result?.ok) return "Complete";
  if (
    join.files.some((f) => !f.ok) ||
    join.crossFileIssues.some((issue) => issue.severity === "error")
  ) {
    return "Blocked";
  }
  if (
    join.files.some((f) => f.issues.some((issue) => issue.severity === "warning")) ||
    join.crossFileIssues.some((issue) => issue.severity === "warning")
  ) {
    return "Warnings";
  }
  if (join.files.length > 0) return "Ready";
  return null;
}

export function PrepareTaskMap(): React.JSX.Element {
  const selectedAction = usePrepareStore((s) => s.selectedAction);
  const setSelectedAction = usePrepareStore((s) => s.setSelectedAction);
  const split = usePrepareStore((s) => s.split);
  const join = usePrepareStore((s) => s.join);

  void split;
  void join;

  return (
    <div className="glass-card grid grid-cols-3 gap-1 rounded-xl border border-border p-1.5 shadow-sm">
      {MODES.map(({ id, label, description, Icon }) => {
        const active = selectedAction === id;
        const state = modeState(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            title={description}
            onClick={() => setSelectedAction(active ? null : id)}
            className={cn(
              "flex h-12 min-w-0 items-center gap-2 rounded-lg border border-transparent px-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "hover:bg-muted/35",
              active && "border-border bg-card shadow-sm",
            )}
          >
            <Icon size={15} aria-hidden="true" className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{label}</span>
              <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {description}
              </span>
            </span>
            {state && (
              <span className="hidden rounded-md border border-border bg-background/45 px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">
                {state}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
