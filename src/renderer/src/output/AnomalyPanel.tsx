import { Loader2, Sparkles } from "lucide-react";
import type { Analysis, Finding } from "@core";
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
 * Findings that name a field or a card are *also* shown beside the data they
 * are about. This panel is the only place the unscoped ones appear.
 */
export function AnomalyPanel(): React.JSX.Element | null {
  const available = useStore((s) => s.settings.aiEnabled);
  const index = useStore((s) => s.index);
  const analysis = useStore((s) => s.analyses[s.index]);
  const engine = useStore((s) => s.aiState);

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
        <Body analysis={analysis} engineKind={engine.kind} />
      </div>
    </section>
  );
}

function Body({
  analysis,
  engineKind,
}: {
  analysis: Analysis | undefined;
  engineKind: string;
}): React.JSX.Element {
  // An answer already given outranks whatever the engine is doing now. The
  // model unloads after idling, and findings from five minutes ago are still
  // about this record — dropping them because the engine went quiet would make
  // the panel forget things it had already told you.
  if (analysis?.status === "clean") return <Quiet>Nothing stood out.</Quiet>;
  if (analysis?.status === "failed") {
    return <Quiet>Could not read this record. {analysis.error ?? ""}</Quiet>;
  }
  if (analysis?.status === "findings") return <Findings analysis={analysis} />;

  if (engineKind === "no-model") {
    return <Quiet>No model downloaded yet — set one up in Settings.</Quiet>;
  }
  if (engineKind === "downloading") return <Working>Downloading the model…</Working>;
  if (engineKind === "loading") return <Working>Starting the model…</Working>;
  if (engineKind === "error") return <Quiet>The model is unavailable.</Quiet>;
  if (analysis?.status === "running") return <Working>Reading this record…</Working>;
  return <Working>Waiting to look at this…</Working>;
}

function Findings({ analysis }: { analysis: Analysis }): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1.5">
      {analysis.findings.map((finding, i) => (
        <Note key={`${finding.field ?? finding.card ?? "row"}-${String(i)}`} finding={finding} />
      ))}
    </ul>
  );
}

function Note({ finding }: { finding: Finding }): React.JSX.Element {
  const tone = finding.severity === "warning" ? "warning" : "info";
  const scope = finding.field ?? finding.card;
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={cn("mt-1 size-1.5 shrink-0 rounded-full", SEVERITY[tone].dotClass)}
      />
      <span className="min-w-0">
        {scope && <span className="font-medium">{scope}: </span>}
        <span className={SEVERITY[tone].textClass}>{finding.reason}</span>
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
