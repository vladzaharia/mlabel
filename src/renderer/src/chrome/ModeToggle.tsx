import { Moon, Sun, SunMoon } from "lucide-react";
import { useStore } from "../store/store";
import { Tooltip } from "../components/ui/tooltip";

const themeIcon = { system: SunMoon, light: Sun, dark: Moon } as const;

/** Cycles light/dark/system mode. Shared by the bottom bar and the start screen. */
export function ModeToggle(): React.JSX.Element {
  const themeMode = useStore((s) => s.themeMode);
  const cycleTheme = useStore((s) => s.cycleTheme);
  const ThemeIcon = themeIcon[themeMode];

  return (
    <Tooltip content={`Theme: ${themeMode}`}>
      <button
        type="button"
        onClick={cycleTheme}
        aria-label="Toggle theme"
        className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ThemeIcon size={15} />
      </button>
    </Tooltip>
  );
}
