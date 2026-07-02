import { useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, Settings2 } from "lucide-react";
import { useStore } from "../store/store";
import { Button } from "../components/ui/button";
import { Logo } from "../components/Logo";
import { ThemeSwitcher } from "../chrome/ThemeSwitcher";
import { ModeToggle } from "../chrome/ModeToggle";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { cn } from "../lib/utils";

function useDragOver(): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // Use a counter to handle nested dragenter/dragleave (child elements fire both).
    let count = 0;

    function onEnter(): void {
      count += 1;
      if (count === 1) setDragging(true);
    }

    function onLeave(): void {
      count = Math.max(0, count - 1);
      if (count === 0) setDragging(false);
    }

    function onDrop(): void {
      count = 0;
      setDragging(false);
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return dragging;
}

export function StartScreen({ kind }: { kind: "config" | "input" }): React.JSX.Element {
  const busy = useStore((s) => s.busy);
  const pickConfig = useStore((s) => s.pickConfig);
  const pickInput = useStore((s) => s.pickInput);
  const headingRef = useHeadingFocus();
  const dragOver = useDragOver();

  const isConfig = kind === "config";
  const Icon = isConfig ? Settings2 : FileSpreadsheet;

  return (
    <div className="relative flex flex-1 flex-col items-center p-8">
      {/* Brand centers within the space between the title bar and the box top. */}
      <div className="flex flex-1 items-center gap-4">
        <Logo size={72} />
        <span className="text-5xl font-semibold tracking-tight">MLabel</span>
      </div>

      <div
        className={cn(
          "glass-card flex max-w-lg flex-col items-center gap-5 rounded-2xl border p-10 text-center shadow-xl transition-colors duration-150",
          dragOver ? "border-accent border-dashed" : "border-border",
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Icon size={26} />
        </div>
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {isConfig ? "Configure MLabel" : "Open data to label"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isConfig
              ? "MLabel is driven by a config file — a JSONC document describing your input columns and the labels to collect."
              : "Select a CSV file that matches the input schema."}
          </p>
        </div>
        <Button
          size="lg"
          disabled={busy}
          onClick={() => void (isConfig ? pickConfig() : pickInput())}
          className="mt-7"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {isConfig ? "Select config…" : "Select input file…"}
        </Button>
        <p className="text-muted-foreground text-xs">…or drag a file onto the window.</p>
      </div>

      {/* Balancing spacer so the box sits at true vertical center. */}
      <div className="flex-1" />

      <div className="no-drag absolute bottom-4 right-4 flex items-center gap-1">
        <ThemeSwitcher />
        <ModeToggle />
      </div>
    </div>
  );
}
