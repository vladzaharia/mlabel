import { useStore } from "../store/store";
import { Dialog, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { Button } from "../components/ui/button";

export function ResumeDialog(): React.JSX.Element | null {
  const pendingResume = useStore((s) => s.pendingResume);
  const applyResume = useStore((s) => s.applyResume);
  const dismissResume = useStore((s) => s.dismissResume);

  if (!pendingResume) return null;
  const labeledCount = Object.keys(pendingResume.labels).length;

  return (
    <Dialog open onOpenChange={(open) => !open && dismissResume()}>
      <DialogTitle>Resume previous session?</DialogTitle>
      <DialogDescription>
        You have unsaved labeling progress for this file ({labeledCount} record
        {labeledCount === 1 ? "" : "s"} touched). Continue where you left off?
      </DialogDescription>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={dismissResume}>
          Start fresh
        </Button>
        <Button onClick={applyResume}>Resume</Button>
      </div>
    </Dialog>
  );
}
