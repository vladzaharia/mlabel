import { TitleBar } from "../chrome/TitleBar";
import { BottomBar } from "../chrome/BottomBar";
import { InputContent } from "../input/InputContent";
import { OutputForm } from "../output/OutputForm";
import { ResumeDialog } from "../flow/ResumeDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export function LabelingView({ onDone }: { onDone: () => void }): React.JSX.Element {
  useKeyboardShortcuts(onDone);
  return (
    <>
      <TitleBar onDone={onDone} />
      <InputContent />
      <OutputForm />
      <BottomBar />
      <ResumeDialog />
    </>
  );
}
