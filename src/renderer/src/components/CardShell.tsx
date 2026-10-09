import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import type { Decoration } from "@core";
import { Callout } from "./Callout";
import { DecorationNotes } from "./DecorationNotes";
import { SEVERITY, type SeverityKind } from "./Severity";
import { cn } from "../lib/utils";

/**
 * Shared card chrome for input and output category cards: heading + optional
 * description, an optional help section, and a divider before the content.
 */
export function CardShell({
  displayName,
  description,
  help,
  tone,
  decorations,
  footer,
  children,
}: {
  displayName?: string;
  description?: string;
  help?: string;
  /** Set by a rule that annotated the whole card. */
  tone?: SeverityKind;
  /**
   * What those rules had to say. Stated once here rather than per field.
   *
   * The decorations rather than their flattened notes, so an authored statement
   * and a model's guess can be told apart at a glance.
   */
  decorations?: readonly Decoration[];
  /**
   * A closing section, below the content and its own divider.
   *
   * Where a verdict about the card as a whole belongs — it is what a reader
   * arrives at after the data, not a preamble to it.
   */
  footer?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const hasHeader = Boolean(displayName);
  return (
    <section
      className={cn(
        "glass-card overflow-hidden rounded-xl border shadow-sm",
        tone ? SEVERITY[tone].borderClass : "border-border",
      )}
    >
      {hasHeader && (
        <div className="px-4 pb-3 pt-4">
          <h2 className="text-sm font-semibold">{displayName}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      {/* Full width, deliberately: this is the counterpart to collapsing the
          per-field problem down to an icon. A statement about the whole group
          earns the space precisely because it is made once. */}
      {decorations && decorations.length > 0 && (
        <div className="px-4 pb-3">
          <Callout tone={tone ?? "info"}>
            <DecorationNotes decorations={decorations} tone={tone} className="mt-0" />
          </Callout>
        </div>
      )}
      {help && (
        <div className="flex items-start gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <HelpCircle size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{help}</span>
        </div>
      )}
      <div className={cn("space-y-4 px-4 pb-4 pt-4", hasHeader && "border-t border-border")}>
        {children}
      </div>
      {footer}
    </section>
  );
}
