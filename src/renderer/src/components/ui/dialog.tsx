import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * `md` is a message; `panel` is a workspace.
 *
 * The panel size exists for the settings pane, which holds a rail and a scrolling
 * body rather than a paragraph and two buttons. It drops the shell's padding so
 * the content can own its own layout, and caps against the viewport so it still
 * fits the 720×560 minimum window.
 */
type DialogSize = "md" | "panel";

const SIZE: Record<DialogSize, string> = {
  md: "w-full max-w-md rounded-xl p-6",
  panel: "w-[min(94vw,980px)] h-[min(88vh,760px)] rounded-xl p-0 flex flex-col overflow-hidden",
};

export function Dialog({
  open,
  onOpenChange,
  size = "md",
  onEscapeKeyDown,
  onInteractOutside,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  size?: DialogSize;
  /**
   * Forwarded so a descendant recording a keystroke can claim Escape for
   * "cancel that", rather than the dialog closing out from under it.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onInteractOutside?: (event: Event) => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <D.Content
          onEscapeKeyDown={onEscapeKeyDown}
          onInteractOutside={onInteractOutside}
          className={cn(
            "glass-popover fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            // Radix focuses the content on open. Without this, Chromium draws
            // its own focus ring around the whole dialog in the OS accent
            // colour — which on a warm accent reads as an error state.
            // Everything inside supplies its own focus-visible ring.
            "border border-border shadow-2xl focus:outline-none",
            SIZE[size],
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

export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  /**
   * Pass `sr-only` where the description exists for `aria-describedby` alone.
   * Radix wants every dialog to have one; not every dialog has something worth
   * saying on screen above its own controls.
   */
  className?: string;
}): React.JSX.Element {
  return (
    <D.Description className={cn("text-muted-foreground mt-1.5 text-sm", className)}>
      {children}
    </D.Description>
  );
}

/** Amber warning box for destructive-action dialogs. Renders nothing when children is falsy. */
export function DialogWarning({ children }: { children?: ReactNode }): React.JSX.Element | null {
  if (!children) return null;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
      <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-warning-text" />
      <p className="text-xs text-warning-text">{children}</p>
    </div>
  );
}
