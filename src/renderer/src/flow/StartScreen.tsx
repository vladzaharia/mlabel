import { FileSpreadsheet, Settings2 } from "lucide-react";
import { useStore } from "../store/store";
import { Button } from "../components/ui/button";
import { Logo } from "../components/Logo";

export function StartScreen({ kind }: { kind: "config" | "input" }): React.JSX.Element {
  const busy = useStore((s) => s.busy);
  const pickConfig = useStore((s) => s.pickConfig);
  const pickInput = useStore((s) => s.pickInput);

  const isConfig = kind === "config";
  const Icon = isConfig ? Settings2 : FileSpreadsheet;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 p-8">
      <div className="flex items-center gap-2.5">
        <Logo size={30} />
        <span className="text-lg font-semibold tracking-tight">MLabel</span>
      </div>

      <div className="glass-card flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border p-10 text-center shadow-xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Icon size={26} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">
            {isConfig ? "Choose a configuration" : "Open data to label"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isConfig
              ? "Select a .jsonc config that describes the input and output schemas."
              : "Select a CSV file that matches the configured input schema."}
          </p>
        </div>
        <Button
          size="lg"
          disabled={busy}
          onClick={() => void (isConfig ? pickConfig() : pickInput())}
        >
          {isConfig ? "Select config…" : "Select input file…"}
        </Button>
        <p className="text-muted-foreground text-xs">…or drag a file onto the window.</p>
      </div>
    </div>
  );
}
