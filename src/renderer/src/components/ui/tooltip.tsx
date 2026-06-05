import type { ReactNode } from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "../../lib/utils";

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}): React.JSX.Element {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            side={side}
            sideOffset={6}
            className={cn(
              "glass-popover z-50 max-w-xs rounded-md border border-border px-3 py-2 text-xs text-popover-foreground shadow-lg",
              "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
            )}
          >
            {content}
            <T.Arrow className="fill-popover" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
