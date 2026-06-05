import { Check, Moon, Sun, SunMoon } from "lucide-react";
import { useStore, selectCompletedCount, selectCurrentRecord } from "../store/store";
import { cn, isMac, isWindows } from "../lib/utils";
import { Tooltip } from "../components/ui/tooltip";
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

const themeIcon = { system: SunMoon, light: Sun, dark: Moon } as const;

export function TitleBar({ onDone }: { onDone: () => void }): React.JSX.Element {
  const config = useStore((s) => s.config);
  const inputPath = useStore((s) => s.inputPath);
  const record = useStore(selectCurrentRecord);
  const total = useStore((s) => s.records.length);
  const completed = useStore(selectCompletedCount);
  const themeMode = useStore((s) => s.themeMode);
  const cycleTheme = useStore((s) => s.cycleTheme);
  const labeling = useStore((s) => s.phase === "labeling");

  const fraction = total > 0 ? completed / total : 0;
  const ThemeIcon = themeIcon[themeMode];

  return (
    <header
      className={cn(
        "drag glass relative flex h-11 shrink-0 items-center border-b border-border",
        isMac() ? "pl-20 pr-2" : isWindows() ? "pl-3 pr-36" : "px-3",
      )}
    >
      <span className="truncate text-sm font-medium">{titleText(config, record, inputPath)}</span>

      <div className="ml-auto flex h-full items-center gap-1">
        <Tooltip content={`Theme: ${themeMode}`}>
          <button
            type="button"
            onClick={cycleTheme}
            aria-label="Toggle theme"
            className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ThemeIcon size={15} />
          </button>
        </Tooltip>

        {labeling && (
          <>
            <span className="no-drag px-2 text-xs tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{completed}</span> / {total} labeled
            </span>
            <button
              type="button"
              onClick={onDone}
              className="no-drag mr-0.5 flex items-center gap-1.5 rounded-md bg-progress px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Check size={15} /> Done
            </button>
          </>
        )}
      </div>

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
