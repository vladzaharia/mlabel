import { cn } from "../lib/utils";

/**
 * A key cap. Decorative by default: the chord is conveyed to assistive tech via
 * `aria-keyshortcuts` on the control it belongs to, so repeating it in the
 * accessible name would only make "Correct" read as "Correct C".
 */
export function Kbd({
  children,
  className,
}: {
  children: string;
  className?: string;
}): React.JSX.Element {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
