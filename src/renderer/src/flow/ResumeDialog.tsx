import { useStore } from "../store/store";
import { Dialog, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";

export function ResumeDialog(): React.JSX.Element | null {
  const pendingResume = useStore((s) => s.pendingResume);
  const applyResume = useStore((s) => s.applyResume);
  const dismissResume = useStore((s) => s.dismissResume);
  const deferResume = useStore((s) => s.deferResume);

  if (!pendingResume) return null;
  const labeledCount = Object.keys(pendingResume.labels).length;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Esc or overlay click → defer only (no session wipe).
        if (!open) deferResume();
      }}
    >
      <DialogTitle>Resume previous session?</DialogTitle>
      <DialogDescription>
        You have unsaved labeling progress for this file ({labeledCount} record
        {labeledCount === 1 ? "" : "s"} touched). Continue where you left off? Starting fresh
        permanently deletes this saved progress.
      </DialogDescription>
      <div className="mt-5 flex justify-end gap-2">
        {/* Resume first in DOM so Radix auto-focuses it. */}
        <Button onClick={applyResume}>Resume</Button>
        <Button variant="danger-outline" onClick={dismissResume}>
          Start fresh
        </Button>
      </div>
    </Dialog>
  );
}
