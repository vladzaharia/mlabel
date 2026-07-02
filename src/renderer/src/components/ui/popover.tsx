import type { ReactNode } from "react";
import { Popover as P } from "radix-ui";
import { HelpCircle } from "lucide-react";
import { cn } from "../../lib/utils";

/** A click-triggered (?) help bubble. */
export function HelpBubble({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <P.Root>
      <P.Trigger asChild>
        <button
          type="button"
          aria-label="Help"
          className="no-drag -m-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle size={13} />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          side="top"
          sideOffset={6}
          className={cn(
            "glass-popover z-50 max-w-xs rounded-md border border-border px-3 py-2 text-xs text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        >
          {children}
          <P.Arrow className="fill-popover" />
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
