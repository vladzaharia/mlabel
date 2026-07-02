import { Moon, Sun, SunMoon } from "lucide-react";
import { useStore } from "../store/store";
import { Button } from "../components/ui/button";
import { Tooltip } from "../components/ui/tooltip";

const themeIcon = { system: SunMoon, light: Sun, dark: Moon } as const;

/** Cycles light/dark/system mode. Shared by the bottom bar and the start screen. */
export function ModeToggle(): React.JSX.Element {
  const themeMode = useStore((s) => s.themeMode);
  const cycleTheme = useStore((s) => s.cycleTheme);
  const ThemeIcon = themeIcon[themeMode];

  return (
    <Tooltip content={`Theme: ${themeMode}`}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={cycleTheme}
        aria-label="Toggle theme"
        className="no-drag text-muted-foreground hover:text-foreground"
      >
        <ThemeIcon size={15} />
      </Button>
    </Tooltip>
  );
}
