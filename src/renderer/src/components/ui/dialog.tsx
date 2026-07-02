import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { cn } from "../../lib/utils";

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <D.Content
          className={cn(
            "glass-popover fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border p-6 shadow-2xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          )}
        >
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function DialogTitle({ children }: { children: ReactNode }): React.JSX.Element {
  return <D.Title className="text-base font-semibold">{children}</D.Title>;
}

export function DialogDescription({ children }: { children: ReactNode }): React.JSX.Element {
  return <D.Description className="text-muted-foreground mt-1.5 text-sm">{children}</D.Description>;
}
