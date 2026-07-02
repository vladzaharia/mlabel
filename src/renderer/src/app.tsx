import { useEffect, type DragEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useStore } from "./store/store";
import { usePrepareStore } from "./store/prepare-store";
import { LabelingView } from "./labeling/LabelingView";
import { StartScreen } from "./flow/StartScreen";
import { ConfigIssueScreen, InputIssueScreen } from "./flow/IssueScreen";
import { DoneScreen } from "./flow/DoneScreen";
import { ModeSelectScreen } from "./flow/ModeSelectScreen";
import { PrepareView } from "./prepare/PrepareView";
import { UpdateIndicator } from "./chrome/UpdateIndicator";
import { Button } from "./components/ui/button";
import { Toaster, toast } from "./components/ui/sonner";
import { chromePadding, cn } from "./lib/utils";

export function App(): React.JSX.Element {
  const phase = useStore((s) => s.phase);
  const config = useStore((s) => s.config);
  const bootstrap = useStore((s) => s.bootstrap);
  const setSystemDark = useStore((s) => s.setSystemDark);
  const loadInputPath = useStore((s) => s.loadInputPath);
  const submitDone = useStore((s) => s.submitDone);
  const backToConfig = useStore((s) => s.backToConfig);
  const backToModeSelect = useStore((s) => s.backToModeSelect);
  const setUpdateStatus = useStore((s) => s.setUpdateStatus);

  useEffect(() => {
    void bootstrap();
    const offTheme = window.api.onThemeChange(setSystemDark);
    const offUpdate = window.api.onUpdateStatus(setUpdateStatus);
    return () => {
      offTheme();
      offUpdate();
    };
  }, [bootstrap, setSystemDark, setUpdateStatus]);

  async function handleDone(): Promise<void> {
    const result = await submitDone();
    if (!result.ok) toast.error("Export failed", { description: result.error });
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    if (!config) return;
    if (phase === "prepare") {
      const paths = [...event.dataTransfer.files].map((file) => window.api.pathForFile(file));
      void usePrepareStore.getState().addDroppedPaths(paths);
      return;
    }
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
      {phase === "select-mode" && (
        <DraggableShell onBack={backToConfig} backLabel="Config">
          {<ModeSelectScreen />}
        </DraggableShell>
      )}
      {phase === "need-input" && (
        <DraggableShell onBack={backToModeSelect} backLabel="Back">
          {<StartScreen kind="input" />}
        </DraggableShell>
      )}
      {phase === "input-invalid" && (
        <DraggableShell onBack={backToModeSelect} backLabel="Back">
          {<InputIssueScreen />}
        </DraggableShell>
      )}
      {phase === "labeling" && <LabelingView onDone={() => void handleDone()} />}
      {phase === "prepare" && (
        <DraggableShell onBack={backToModeSelect} backLabel="Back">
          {<PrepareView />}
        </DraggableShell>
      )}
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
  backLabel = "Config",
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}): React.JSX.Element {
  return (
    <>
      <div className={cn("drag flex h-11 shrink-0 items-center", chromePadding())}>
        {onBack && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onBack}
            className="no-drag font-normal text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={15} /> {backLabel}
          </Button>
        )}
        <div className="no-drag ml-auto">
          <UpdateIndicator />
        </div>
      </div>
      {children}
    </>
  );
}
