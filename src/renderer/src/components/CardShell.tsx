import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Shared card chrome for input and output category cards: heading + optional
 * description, an optional help section, and a divider before the content.
 */
export function CardShell({
  displayName,
  description,
  help,
  children,
}: {
  displayName?: string;
  description?: string;
  help?: string;
  children: ReactNode;
}): React.JSX.Element {
  const hasHeader = Boolean(displayName);
  return (
    <section className="glass-card overflow-hidden rounded-xl border border-border shadow-sm">
      {hasHeader && (
        <div className="px-4 pb-3 pt-4">
          <h2 className="text-sm font-semibold">{displayName}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
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
    </section>
  );
}
