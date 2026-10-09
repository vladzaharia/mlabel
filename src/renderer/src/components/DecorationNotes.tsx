import type { Decoration } from "@core";
import { SEVERITY, type SeverityKind } from "./Severity";
import { cn } from "../lib/utils";

/** Explanations attached by display rules to a value or card. */
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
  return (
    <div className={cn("mt-1 flex flex-col gap-0.5 text-xs", className)}>
      {withNotes.map((decoration, i) => (
        <p
          key={`${decoration.rule}-${String(i)}`}
          className={tone ? SEVERITY[tone].textClass : "text-muted-foreground"}
        >
          {decoration.style.note}
        </p>
      ))}
    </div>
  );
}

/** A colored rail marks a value highlighted by a display rule. */
export function frameFor(tone: SeverityKind | undefined): string | undefined {
  return tone ? SEVERITY[tone].frameClass : undefined;
}
