import { TitleBar } from "../chrome/TitleBar";
import { BottomBar } from "../chrome/BottomBar";
import { InputContent } from "../input/InputContent";
import { OutputForm } from "../output/OutputForm";
import { ResumeDialog } from "../flow/ResumeDialog";

export function LabelingView({ onDone }: { onDone: () => void }): React.JSX.Element {
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
