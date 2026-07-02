import { ChevronRight, Save } from "lucide-react";
import { useStore, selectCompletedCount, selectCurrentRecord } from "../store/store";
import { Button } from "../components/ui/button";
import { chromePadding, cn } from "../lib/utils";
import type { AppConfig, CoercedValue, RecordView } from "@core";

function titleText(
  config: AppConfig | null,
  record: RecordView | undefined,
  inputPath: string | null,
): string {
  const titleField = config?.input.fields.find((f) => f.title);
  if (titleField && record) {
    const value = record.inputValues[titleField.name] as CoercedValue | undefined;
    if (value !== null && value !== undefined && value !== "") return formatTitle(value);
  }
  if (inputPath) return inputPath.split(/[/\\]/).pop() ?? "MLabel";
  return "MLabel";
}

function formatTitle(value: CoercedValue): string {
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function TitleBar({ onDone }: { onDone: () => void }): React.JSX.Element {
  const config = useStore((s) => s.config);
  const inputPath = useStore((s) => s.inputPath);
  const record = useStore(selectCurrentRecord);
  const index = useStore((s) => s.index);
  const total = useStore((s) => s.records.length);
  const completed = useStore(selectCompletedCount);
  const next = useStore((s) => s.next);
  const labeling = useStore((s) => s.phase === "labeling");

  const fraction = total > 0 ? completed / total : 0;

  return (
    <header
      className={cn(
        "drag glass relative flex h-11 shrink-0 items-center border-b border-border",
        chromePadding(),
      )}
    >
      <span className="truncate text-sm font-medium">{titleText(config, record, inputPath)}</span>

      {labeling && (
        <div className="ml-auto flex h-full items-center gap-3">
          <span className="no-drag px-2 text-xs tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{completed}</span> / {total} labeled
          </span>
          <Button
            size="xs"
            onClick={next}
            disabled={index >= total - 1}
            className="no-drag shadow-sm"
          >
            Next <ChevronRight size={13} />
          </Button>
          <Button size="xs" variant="success" onClick={onDone} className="no-drag mr-0.5 shadow-sm">
            <Save size={13} /> Save
          </Button>
        </div>
      )}

      {/* Full-width progress bar as the title bar's bottom border. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-transparent">
        <div
          className="h-full bg-progress transition-[width] duration-300 ease-out"
          style={{ width: `${String(fraction * 100)}%` }}
        />
      </div>
    </header>
  );
}
