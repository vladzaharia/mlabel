import { Popover as P } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { useStore, COLOR_THEMES } from "../store/store";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

/** Borderless color-theme picker styled to match the "‹ Config" button. */
export function ThemeSwitcher(): React.JSX.Element {
  const colorTheme = useStore((s) => s.colorTheme);
  const setColorTheme = useStore((s) => s.setColorTheme);
  const active = COLOR_THEMES.find((t) => t.id === colorTheme) ?? COLOR_THEMES[0]!;

  return (
    <P.Root>
      <P.Trigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label="Color theme"
          className="no-drag gap-1.5 font-normal text-muted-foreground hover:text-foreground"
        >
          <Swatch color={active.swatch} />
          {active.name}
          <ChevronDown size={13} className="opacity-70" />
        </Button>
      </P.Trigger>
      <P.Portal>
        <P.Content
          side="top"
          align="end"
          sideOffset={6}
          className={cn(
            "glass-popover z-50 min-w-48 rounded-md border border-border p-1 text-popover-foreground shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          )}
        >
          {COLOR_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setColorTheme(theme.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Swatch color={theme.swatch} />
              <span className="flex-1">{theme.name}</span>
              {theme.id === colorTheme && <Check size={13} className="text-accent" />}
            </button>
          ))}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

function Swatch({ color }: { color: string }): React.JSX.Element {
  return (
    <span
      className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/10"
      style={{ background: color }}
    />
  );
}
