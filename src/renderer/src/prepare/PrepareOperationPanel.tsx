import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PrepareOperationPanel({
  title,
  description,
  Icon,
  children,
}: {
  title: string;
  description: string;
  Icon: LucideIcon;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="glass-card overflow-hidden rounded-xl border border-border shadow-sm">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Icon size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

export function PrepareSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">{eyebrow}</p>
        <h3 className="mt-0.5 text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
