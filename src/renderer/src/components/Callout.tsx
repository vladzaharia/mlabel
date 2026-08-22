import { SEVERITY, type SeverityKind } from "./Severity";
import { cn } from "../lib/utils";

/**
 * A tinted inline message.
 *
 * This shape — rounded border at 30% alpha over a 10% fill, with the matching
 * `-text` colour — was hand-copied in nine places across the Prepare and
 * labeling screens. One component driven by the `SEVERITY` table keeps them in
 * step, and keeps new tones (a display rule's note, a coercion problem) looking
 * like the rest of the app rather than like a bolt-on.
 */
export function Callout({
  tone = "info",
  icon = true,
  className,
  children,
}: {
  tone?: SeverityKind;
  /** Set false for a bare note where the surrounding context already says why. */
  icon?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { Icon, textClass } = SEVERITY[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs",
        TINT[tone],
        textClass,
        className,
      )}
    >
      {icon && <Icon size={13} aria-hidden="true" className="mt-0.5 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Border/fill pair per tone. Kept beside the component that draws it. */
const TINT: Record<SeverityKind, string> = {
  danger: "border-danger/30 bg-danger/10",
  warning: "border-warning/30 bg-warning/10",
  success: "border-progress/30 bg-progress/10",
  info: "border-info/30 bg-info/10",
  accent: "border-accent/30 bg-accent/10",
  muted: "border-border bg-muted/50",
};
