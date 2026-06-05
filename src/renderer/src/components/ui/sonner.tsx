import { Toaster as Sonner } from "sonner";
import { resolveDark, useStore } from "../../store/store";

/** App-wide toast host, theme-synced with clean rich colors. */
export function Toaster(): React.JSX.Element {
  const dark = useStore((s) => resolveDark(s.themeMode, s.systemDark));
  return (
    <Sonner
      position="bottom-right"
      theme={dark ? "dark" : "light"}
      richColors
      closeButton
      toastOptions={{ classNames: { toast: "!rounded-lg !border" } }}
    />
  );
}

export { toast } from "sonner";
