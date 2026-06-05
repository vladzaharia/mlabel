import { useEffect, type DragEvent } from "react";
import { useStore } from "./store/store";
import { LabelingView } from "./labeling/LabelingView";
import { StartScreen } from "./flow/StartScreen";
import { ConfigIssueScreen, InputIssueScreen } from "./flow/IssueScreen";
import { Toaster, toast } from "./components/ui/sonner";

export function App(): React.JSX.Element {
  const phase = useStore((s) => s.phase);
  const config = useStore((s) => s.config);
  const bootstrap = useStore((s) => s.bootstrap);
  const setSystemDark = useStore((s) => s.setSystemDark);
  const loadInputPath = useStore((s) => s.loadInputPath);
  const runExport = useStore((s) => s.runExport);

  useEffect(() => {
    void bootstrap();
    return window.api.onThemeChange(setSystemDark);
  }, [bootstrap, setSystemDark]);

  async function handleDone(): Promise<void> {
    const result = await runExport();
    if (result.ok) {
      toast.success(`Exported ${String(result.completeCount ?? 0)} record(s)`, {
        description: result.remainingCount
          ? `${String(result.remainingCount)} incomplete record(s) written to the remaining file.`
          : "All records complete.",
      });
    } else {
      toast.error("Export failed", { description: result.error });
    }
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
      {phase === "need-input" && <DraggableShell>{<StartScreen kind="input" />}</DraggableShell>}
      {phase === "input-invalid" && <DraggableShell>{<InputIssueScreen />}</DraggableShell>}
      {phase === "labeling" && <LabelingView onDone={() => void handleDone()} />}
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

/** Keeps the frameless window draggable on the non-labeling screens. */
function DraggableShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <>
      <div className="drag h-11 shrink-0" />
      {children}
    </>
  );
}
