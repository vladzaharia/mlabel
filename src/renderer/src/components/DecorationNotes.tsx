import { Sparkles } from "lucide-react";
import type { Decoration } from "@core";
import { SEVERITY, type SeverityKind } from "./Severity";
import { cn } from "../lib/utils";

/**
 * The explanations attached to a value or a card.
 *
 * Authored notes and model notes are drawn differently on purpose. A display
 * rule was written by someone who knows the data and fires deterministically; a
 * model finding is a guess from a small local model, right perhaps four times in
 * five. Rendered identically, a labeler could not tell which is which — and in a
 * tool whose output becomes somebody's ground truth, that difference is exactly
 * the one worth preserving.
 *
 * The marker is an icon *and* a title, never colour alone.
 */
export function DecorationNotes({
  decorations,
  tone,
  className,
}: {
  decorations: readonly Decoration[] | undefined;
  tone: SeverityKind | undefined;
  className?: string;
}): React.JSX.Element | null {
  const withNotes = (decorations ?? []).filter((d) => d.style.note !== undefined);
  if (withNotes.length === 0) return null;

  const toneClass = tone ? SEVERITY[tone].textClass : "text-muted-foreground";

  return (
    <div className={cn("mt-1 flex flex-col gap-0.5 text-xs", className)}>
      {withNotes.map((decoration, i) => {
        const fromModel = decoration.source === "model";
        return (
          <p
            key={`${decoration.rule}-${String(i)}`}
            className={cn(
              "flex items-start gap-1",
              fromModel ? "text-muted-foreground" : toneClass,
            )}
          >
            {fromModel && <Sparkles size={11} aria-hidden="true" className="mt-0.5 shrink-0" />}
            <span>
              {fromModel && <span className="sr-only">Suggested by the local model: </span>}
              {decoration.style.note}
            </span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * The frame for a decorated value.
 *
 * A solid rail is an authored rule; a dashed one is the model. Provisional
 * things should look provisional, and the dash carries that without needing a
 * second colour or a second tone.
 */
export function frameFor(
  tone: SeverityKind | undefined,
  decorations: readonly Decoration[] | undefined,
): string | undefined {
  if (!tone) return undefined;
  const onlyModel =
    (decorations ?? []).length > 0 && (decorations ?? []).every((d) => d.source === "model");
  return cn(SEVERITY[tone].frameClass, onlyModel && "border-dashed");
}
