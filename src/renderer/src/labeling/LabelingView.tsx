import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TitleBar } from "../chrome/TitleBar";
import { BottomBar } from "../chrome/BottomBar";
import { InputContent } from "../input/InputContent";
import { OutputForm } from "../output/OutputForm";
import { ResumeDialog } from "../flow/ResumeDialog";
import { ShortcutsDialog } from "../components/ShortcutsDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useStore, selectCompletedCount } from "../store/store";
import { debounce } from "../lib/utils";
import { announce } from "../a11y/announcer";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { Button } from "../components/ui/button";

const MILESTONES = [0.25, 0.5, 0.75, 1.0];

function useLabelingAnnouncements(): void {
  const index = useStore((s) => s.index);
  const total = useStore((s) => s.records.length);
  const completed = useStore(selectCompletedCount);

  // Debounced navigation announcement.
  const debouncedNav = useRef(
    debounce((idx: number, tot: number) => {
      if (tot > 0) announce(`Record ${String(idx + 1)} of ${String(tot)}`);
    }, 300),
  ).current;

  useEffect(() => {
    return () => {
      debouncedNav.cancel();
    };
  }, [debouncedNav]);

  useEffect(() => {
    debouncedNav(index, total);
  }, [index, total, debouncedNav]);

  // Track which milestones have already been announced this session.
  const announcedMilestones = useRef(new Set<number>());

  useEffect(() => {
    if (total === 0) return;
    const fraction = completed / total;
    for (const milestone of MILESTONES) {
      if (fraction >= milestone && !announcedMilestones.current.has(milestone)) {
        announcedMilestones.current.add(milestone);
        if (milestone === 1.0) {
          announce("All records labeled");
        } else {
          announce(`${String(Math.round(milestone * 100))}% of records labeled`);
        }
      }
    }
  }, [completed, total]);
}

export function LabelingView({ onDone }: { onDone: () => void }): React.JSX.Element {
  const [helpOpen, setHelpOpen] = useState(false);
  useKeyboardShortcuts({ onDone, onToggleHelp: () => setHelpOpen((o) => !o) });
  useLabelingAnnouncements();
  const headingRef = useHeadingFocus();
  const records = useStore((s) => s.records);
  const exportError = useStore((s) => s.exportError);
  const clearExportError = useStore((s) => s.clearExportError);
  const backToInput = useStore((s) => s.backToInput);

  if (records.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-muted-foreground text-sm">No records to label in this file.</p>
        <Button variant="outline" onClick={backToInput}>
          Choose another file
        </Button>
      </div>
    );
  }

  return (
    <>
      <TitleBar onDone={onDone} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <h1 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
          Labeling
        </h1>
        {exportError && (
          <div className="flex items-center gap-3 border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger-text">
            <span className="flex-1">{exportError}</span>
            <Button size="xs" variant="danger-outline" onClick={() => void onDone()}>
              Try again
            </Button>
            <button
              type="button"
              aria-label="Dismiss export error"
              onClick={clearExportError}
              className="rounded p-0.5 hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        <InputContent />
        <OutputForm />
      </main>
      <BottomBar onHelp={() => setHelpOpen((o) => !o)} />
      <ResumeDialog />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
