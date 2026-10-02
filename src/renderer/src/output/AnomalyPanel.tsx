import { Loader2, Sparkles } from "lucide-react";
import {
  isWorthShowing,
  noteFor,
  questionsOf,
  severityOf,
  type Analysis,
  type Answer,
  type TargetedQuestion,
} from "@core";
import { SEVERITY } from "../components/Severity";
import { useStore } from "../store/store";
import { cn } from "../lib/utils";

/**
 * What the local model made of this record.
 *
 * Sits under the answers rather than over them, and says so in its own words:
 * these are suggestions from a small model that is wrong a fair fraction of the
 * time, and the labeler's judgement is the one being recorded. There is
 * deliberately no button that fills anything in — the whole risk with a feature
 * like this in a labeling tool is that a plausible wrong hint quietly becomes
 * the answer.
 *
 * **Only record-level answers appear here.** An answer about a field or a card is
 * already drawn beside the data it is about, and repeating it in a panel on the
 * far side of the window means a reviewer reads the same sentence three times
 * and learns nothing the second or third. This panel exists for the answers that
 * have nowhere else to sit — including the two the app always asks.
 *
 * A probability is shown as a probability. It is better calibrated than the
 * prose this replaced and more persuasive for the same reason, which is why
 * nothing here reads as a verdict and why answers below their threshold are not
 * shown at all — an uncertain claim in a confident voice is the one thing this
 * panel must never be.
 */
export function AnomalyPanel(): React.JSX.Element | null {
  const available = useStore((s) => s.settings.aiEnabled);
  const index = useStore((s) => s.index);
  const analysis = useStore((s) => s.analyses[s.index]);
  const engine = useStore((s) => s.aiState);
  const config = useStore((s) => s.config);
  const questions = questionsOf(config);

  if (!available) return null;

  return (
    <section
      aria-label="Model notes"
      className="shrink-0 border-t border-border/60 px-6 py-2.5"
      // Keyed on the record so a screen reader announces the new record's
      // findings rather than treating them as an edit to the old ones.
      key={index}
    >
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles size={11} aria-hidden="true" />
        Model notes
      </h3>
      <div aria-live="polite" className="mt-1.5">
        <Body analysis={analysis} engineKind={engine.kind} questions={questions} />
      </div>
    </section>
  );
}

function Body({
  analysis,
  engineKind,
  questions,
}: {
  analysis: Analysis | undefined;
  engineKind: string;
  questions: readonly TargetedQuestion[];
}): React.JSX.Element {
  // An answer already given outranks whatever the engine is doing now. The
  // model unloads after idling, and answers from five minutes ago are still
  // about this record — dropping them because the engine went quiet would make
  // the panel forget things it had already told you.
  if (analysis?.status === "clean") return <Quiet>Nothing stood out.</Quiet>;
  if (analysis?.status === "failed") {
    return <Quiet>Could not read this record. {analysis.error ?? ""}</Quiet>;
  }
  if (analysis?.status === "findings") {
    return <Answers analysis={analysis} questions={questions} />;
  }

  if (engineKind === "no-model") {
    return <Quiet>No model downloaded yet — set one up in Settings.</Quiet>;
  }
  if (engineKind === "downloading") return <Working>Downloading the model…</Working>;
  if (engineKind === "loading") return <Working>Starting the model…</Working>;
  if (engineKind === "error") return <Quiet>The model is unavailable.</Quiet>;
  if (analysis?.status === "running") return <Working>Reading this record…</Working>;
  return <Working>Waiting to look at this…</Working>;
}

function Answers({
  analysis,
  questions,
}: {
  analysis: Analysis;
  questions: readonly TargetedQuestion[];
}): React.JSX.Element {
  const byId = new Map(questions.map((question) => [question.id, question]));

  // An answer whose question has vanished — a config reloaded while the cache
  // survived — is dropped rather than shown without its heading. A probability
  // with nothing to attach it to is not a note, it is a number.
  const shown = analysis.answers.flatMap((answer) => {
    const question = byId.get(answer.id);
    if (!question || !isWorthShowing(answer, question)) return [];
    // Targeted answers are already beside their field or on their card.
    if (question.field !== undefined || question.card !== undefined) return [];
    return [{ answer, question }];
  });

  if (shown.length === 0) return <Quiet>Nothing stood out.</Quiet>;

  return (
    <ul className="flex flex-col gap-1.5">
      {shown.map(({ answer, question }) => (
        <Note answer={answer} key={answer.id} question={question} />
      ))}
    </ul>
  );
}

function Note({
  answer,
  question,
}: {
  answer: Answer;
  question: TargetedQuestion;
}): React.JSX.Element {
  const tone = severityOf(answer, question);
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={cn("mt-1 size-1.5 shrink-0 rounded-full", SEVERITY[tone].dotClass)}
      />
      <span className="min-w-0">
        <span className={SEVERITY[tone].textClass}>{noteFor(question, answer)}</span>
      </span>
    </li>
  );
}

const Quiet = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

const Working = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
    <Loader2 size={11} aria-hidden="true" className="motion-safe:animate-spin" />
    {children}
  </p>
);
