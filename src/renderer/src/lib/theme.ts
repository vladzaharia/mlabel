/**
 * Theme bridge: the OS theme is the source of truth (resolved in the main
 * process via `nativeTheme`). The renderer applies a `.dark` class on <html>
 * and stays in sync with OS changes. The document defaults to `.dark` (see
 * index.html) so the first paint is dark with no flash on dark-mode systems.
 */

function applyTheme(isDark: boolean): void {
  document.documentElement.classList.toggle("dark", isDark);
}

/** Resolve the current OS theme and subscribe to changes. Returns a cleanup fn. */
export function initThemeBridge(): () => void {
  let unsubscribe: (() => void) | undefined;

  void window.api.getTheme().then(applyTheme);
  unsubscribe = window.api.onThemeChange(applyTheme);

  return () => unsubscribe?.();
}
