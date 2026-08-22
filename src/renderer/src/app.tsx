import { useEffect, type DragEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useStore } from "./store/store";
import type { Phase } from "./store/store";
import { usePrepareStore } from "./store/prepare-store";
import { LabelingView } from "./labeling/LabelingView";
import { PrefillScreen } from "./flow/PrefillScreen";
import { StartScreen } from "./flow/StartScreen";
import { ConfigIssueScreen, InputIssueScreen } from "./flow/IssueScreen";
import { DoneScreen } from "./flow/DoneScreen";
import { PrepareView } from "./prepare/PrepareView";
import { UpdateIndicator } from "./chrome/UpdateIndicator";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import { baseName, chromePadding, cn } from "./lib/utils";
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
    case "need-prefill":
      // The PrefillScreen h1 receives focus; AT reads the heading directly.
      return null;
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
      void usePrepareStore.getState().dropPaths(paths);
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
        <DraggableShell onBack={backToConfig} backLabel="Change config…" showConfig>
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
      {phase === "need-prefill" && (
        <DraggableShell onBack={backToInput} backLabel="Back">
          <PrefillScreen />
        </DraggableShell>
      )}
      {phase === "labeling" && <LabelingView onDone={() => void handleDone()} />}
      {phase === "prepare" && (
        <DraggableShell>
          <main className="flex min-h-0 flex-1 flex-col">
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

/**
 * Keeps the frameless window draggable on the non-labeling screens, with an
 * optional back affordance.
 *
 * When a config is loaded this shows *which* one, next to a real button to
 * change it. Before, the only route back was a ghost `xs` chevron in the
 * traffic-light gutter — the weakest control in the app performing its most
 * destructive action, on a screen that never said which config was in force.
 */
function DraggableShell({
  children,
  onBack,
  backLabel = "Config",
  showConfig = false,
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  /** Show the loaded config's name beside the back button. */
  showConfig?: boolean;
}): React.JSX.Element {
  const configPath = useStore((s) => s.configPath);
  const configName = configPath ? baseName(configPath) : null;

  return (
    <>
      <div className={cn("drag flex h-11 shrink-0 items-center gap-2", chromePadding())}>
        {showConfig && configName && (
          <span
            title={configPath ?? undefined}
            className="no-drag max-w-56 truncate rounded-md border border-accent/40 bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
          >
            {configName}
          </span>
        )}
        {onBack && (
          <Button
            variant={showConfig ? "outline" : "ghost"}
            size="xs"
            onClick={onBack}
            className={cn(
              "no-drag",
              !showConfig && "font-normal text-muted-foreground hover:text-foreground",
            )}
          >
            {!showConfig && <ChevronLeft size={15} aria-hidden="true" />} {backLabel}
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
