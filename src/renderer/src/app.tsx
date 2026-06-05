import { useEffect, type DragEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useStore } from "./store/store";
import { LabelingView } from "./labeling/LabelingView";
import { StartScreen } from "./flow/StartScreen";
import { ConfigIssueScreen, InputIssueScreen } from "./flow/IssueScreen";
import { DoneScreen } from "./flow/DoneScreen";
import { Toaster, toast } from "./components/ui/sonner";
import { cn, isMac } from "./lib/utils";

export function App(): React.JSX.Element {
  const phase = useStore((s) => s.phase);
  const config = useStore((s) => s.config);
  const bootstrap = useStore((s) => s.bootstrap);
  const setSystemDark = useStore((s) => s.setSystemDark);
  const loadInputPath = useStore((s) => s.loadInputPath);
  const submitDone = useStore((s) => s.submitDone);
  const backToConfig = useStore((s) => s.backToConfig);

  useEffect(() => {
    void bootstrap();
    return window.api.onThemeChange(setSystemDark);
  }, [bootstrap, setSystemDark]);

  async function handleDone(): Promise<void> {
    const result = await submitDone();
    if (!result.ok) toast.error("Export failed", { description: result.error });
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    if (!config) return;
    const file = event.dataTransfer.files[0];
    if (file) void loadInputPath(window.api.pathForFile(file));
  }

  return (
    <div
      className="app-base flex h-full flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {phase === "boot" && <BootSplash />}
      {phase === "need-config" && <DraggableShell>{<StartScreen kind="config" />}</DraggableShell>}
      {phase === "config-invalid" && <DraggableShell>{<ConfigIssueScreen />}</DraggableShell>}
      {phase === "need-input" && (
        <DraggableShell onBack={backToConfig}>{<StartScreen kind="input" />}</DraggableShell>
      )}
      {phase === "input-invalid" && (
        <DraggableShell onBack={backToConfig}>{<InputIssueScreen />}</DraggableShell>
      )}
      {phase === "labeling" && <LabelingView onDone={() => void handleDone()} />}
      {phase === "done" && <DraggableShell>{<DoneScreen />}</DraggableShell>}
      <Toaster />
    </div>
  );
}

function BootSplash(): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-muted-foreground text-sm">Loading…</span>
    </div>
  );
}

/** Keeps the frameless window draggable on the non-labeling screens, with an
 *  optional top-left back button (e.g. to switch configs). */
function DraggableShell({
  children,
  onBack,
}: {
  children: ReactNode;
  onBack?: () => void;
}): React.JSX.Element {
  return (
    <>
      <div className={cn("drag flex h-11 shrink-0 items-center", isMac() ? "pl-20" : "pl-2")}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="no-drag flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft size={15} /> Config
          </button>
        )}
      </div>
      {children}
    </>
  );
}
