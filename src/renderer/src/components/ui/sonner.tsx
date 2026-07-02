import { Toaster as Sonner } from "sonner";
import { resolveDark, useStore } from "../../store/store";

/**
 * App-wide toast host, theme-synced with clean rich colors.
 *
 * Toast rule: toasts are supplementary feedback only. Anything actionable
 * (errors the user must act on) must also appear inline in the UI — never
 * rely on a toast alone.
 *
 * Durations: default 5 s; errors 10 s (pass `duration: 10000` at call site).
 */
export function Toaster(): React.JSX.Element {
  const dark = useStore((s) => resolveDark(s.themeMode, s.systemDark));
  return (
    <Sonner
      position="bottom-right"
      theme={dark ? "dark" : "light"}
      richColors
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border",
          closeButton: "!size-6",
        },
      }}
    />
  );
}

export { toast } from "sonner";
