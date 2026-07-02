import { FileSpreadsheet, Scissors } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStore } from "../store/store";
import { Logo } from "../components/Logo";
import { ThemeSwitcher } from "../chrome/ThemeSwitcher";
import { ModeToggle } from "../chrome/ModeToggle";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

/** After a config loads: choose between labeling data and preparing files. */
export function ModeSelectScreen(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const chooseLabeling = useStore((s) => s.chooseLabeling);
  const choosePrepare = useStore((s) => s.choosePrepare);
  const headingRef = useHeadingFocus();

  const title = config?.ui?.appTitle ?? "MLabel";
  const inputCount = config?.input.fields.length ?? 0;
  const outputCount = config?.output.fields.length ?? 0;

  return (
    <div className="relative flex flex-1 flex-col items-center p-8">
      <div className="flex flex-1 items-center gap-4">
        <Logo size={72} />
        <span className="text-5xl font-semibold tracking-tight">MLabel</span>
      </div>

      <div className="glass-card flex w-full max-w-2xl flex-col gap-5 rounded-2xl border border-border p-8 shadow-xl">
        <div className="text-center">
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {inputCount} input column{inputCount === 1 ? "" : "s"} · {outputCount} output field
            {outputCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <ModeCard
            icon={FileSpreadsheet}
            title="Label data"
            description="Open an input file and label records one at a time."
            onClick={chooseLabeling}
          />
          <ModeCard
            icon={Scissors}
            title="Prepare data"
            description="Split an input file to distribute, or join labeled results back together."
            onClick={choosePrepare}
          />
        </div>
      </div>

      <div className="flex-1" />

      <div className="no-drag absolute bottom-4 right-4 flex items-center gap-1">
        <ThemeSwitcher />
        <ModeToggle />
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-3 rounded-xl border border-border bg-background/30 p-6 text-center transition-colors hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Icon size={24} />
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>
    </button>
  );
}
