import { useEffect, type DragEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useStore } from "./store/store";
import type { Phase } from "./store/store";
import { usePrepareStore } from "./store/prepare-store";
import { LabelingView } from "./labeling/LabelingView";
import { StartScreen } from "./flow/StartScreen";
import { ConfigIssueScreen, InputIssueScreen } from "./flow/IssueScreen";
import { DoneScreen } from "./flow/DoneScreen";
import { PrepareView } from "./prepare/PrepareView";
import { UpdateIndicator } from "./chrome/UpdateIndicator";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { chromePadding, cn } from "./lib/utils";
import { LiveAnnouncer } from "./a11y/LiveAnnouncer";
import { announce } from "./a11y/announcer";

function phaseAnnouncement(
  phase: Phase,
): { message: string; politeness: "polite" | "assertive" } | null {
  switch (phase) {
    case "boot":
      return null;
    case "need-config":
      return { message: "Choose a config file", politeness: "polite" };
    case "config-invalid":
      return { message: "Config invalid", politeness: "assertive" };
    case "need-input":
      return { message: "Choose data to label", politeness: "polite" };
    case "input-invalid":
      return { message: "Input invalid", politeness: "assertive" };
    case "labeling":
      // The LabelingView h1 receives focus; AT reads the heading directly.
      return null;
    case "prepare":
      // The PrepareView h1 receives focus; AT reads the heading directly.
      return null;
    case "done":
      return { message: "Export complete", politeness: "polite" };
  }
}

export function App(): React.JSX.Element {
  const phase = useStore((s) => s.phase);
  const config = useStore((s) => s.config);
  const bootstrap = useStore((s) => s.bootstrap);
  const setSystemDark = useStore((s) => s.setSystemDark);
  const loadInputPath = useStore((s) => s.loadInputPath);
  const submitDone = useStore((s) => s.submitDone);
  const backToConfig = useStore((s) => s.backToConfig);
  const backToInput = useStore((s) => s.backToInput);
  const setUpdateStatus = useStore((s) => s.setUpdateStatus);

  useEffect(() => {
    void bootstrap();
    const offTheme = window.api.onThemeChange(setSystemDark);
    const offUpdate = window.api.onUpdateStatus(setUpdateStatus);
    const offSetMode = window.api.onSetMode((mode) => {
      useStore.getState().setMode(mode);
    });
    return () => {
      offTheme();
      offUpdate();
      offSetMode();
    };
  }, [bootstrap, setSystemDark, setUpdateStatus]);

  useEffect(() => {
    const announcement = phaseAnnouncement(phase);
    if (announcement) announce(announcement.message, announcement.politeness);
  }, [phase]);

  async function handleDone(): Promise<void> {
    await submitDone();
    // Export failures are surfaced via the inline banner in LabelingView +
    // an assertive aria-live announcement. No toast needed here.
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
      {phase === "need-config" && (
        <DraggableShell>
          <main className="flex flex-1 flex-col">
            <StartScreen kind="config" />
          </main>
        </DraggableShell>
      )}
      {phase === "config-invalid" && (
        <DraggableShell>
          <main className="flex flex-1 flex-col">
            <ConfigIssueScreen />
          </main>
        </DraggableShell>
      )}
      {phase === "need-input" && (
        <DraggableShell onBack={backToConfig} backLabel="Config">
          <main className="flex flex-1 flex-col">
            <StartScreen kind="input" />
          </main>
        </DraggableShell>
      )}
      {phase === "input-invalid" && (
        <DraggableShell onBack={backToInput} backLabel="Back">
          <main className="flex flex-1 flex-col">
            <InputIssueScreen />
          </main>
        </DraggableShell>
      )}
      {phase === "labeling" && <LabelingView onDone={() => void handleDone()} />}
      {phase === "prepare" && (
        <DraggableShell>
          <main className="flex flex-1 flex-col">
            <PrepareView />
          </main>
        </DraggableShell>
      )}
      {phase === "done" && (
        <DraggableShell>
          <main className="flex flex-1 flex-col">
            <DoneScreen />
          </main>
        </DraggableShell>
      )}
      <LiveAnnouncer />
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
            <ChevronLeft size={15} aria-hidden="true" /> {backLabel}
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
