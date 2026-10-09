import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Shared chrome for one section of the settings pane.
 *
 * No subtitle slot, deliberately. Every one of them restated its own heading —
 * "Keys and chords: every shortcut in this window" — and a line of prose above
 * the controls pushes the thing a person opened the pane for below the fold.
 * Where a control genuinely needs explaining, the explanation belongs on that
 * control.
 */
export function SettingsSection({
  title,
  action,
  children,
}: {
  title: string;
  /** A control that belongs to the section as a whole, e.g. "Reset all". */
  action?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="w-full max-w-[720px]">
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <h2 className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
        {action}
      </header>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** An inset panel. Never `glass-card` here — stacked blur inside the dialog muddies. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("rounded-lg border border-border bg-background/35 p-4", className)}>
      {children}
    </div>
  );
}

/** A small all-caps group heading. */
export function Eyebrow({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/** A labelled fact, for the one-line rows that make up most of this pane. */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-3 py-1 text-sm">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

/** Nothing to show, said in a way that does not read as a failure. */
export function Empty({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
