import { useEffect, useRef } from "react";
import { TitleBar } from "../chrome/TitleBar";
import { BottomBar } from "../chrome/BottomBar";
import { InputContent } from "../input/InputContent";
import { OutputForm } from "../output/OutputForm";
import { ResumeDialog } from "../flow/ResumeDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useStore, selectCompletedCount } from "../store/store";
import { debounce } from "../lib/utils";
import { announce } from "../a11y/announcer";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

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
  useKeyboardShortcuts(onDone);
  useLabelingAnnouncements();
  const headingRef = useHeadingFocus();

  return (
    <>
      <TitleBar onDone={onDone} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <h1 ref={headingRef} tabIndex={-1} className="sr-only outline-none">
          Labeling
        </h1>
        <InputContent />
        <OutputForm />
      </main>
      <BottomBar />
      <ResumeDialog />
    </>
  );
}
