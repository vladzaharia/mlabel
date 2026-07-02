/**
 * Factory for the `before-quit` handler that flushes pending writes before
 * allowing Electron to exit.
 *
 * On first invocation:
 *   - preventDefault() to hold the quit
 *   - Race all flush functions against a timeout
 *   - Call quit() exactly once when done
 *
 * On subsequent invocations (the re-entrant quit triggered by quit() above):
 *   - Do nothing (no preventDefault, no second quit)
 */
export function createQuitFlushHandler(
  flushes: Array<() => Promise<void>>,
  quit: () => void,
  timeoutMs = 2000,
): (event: { preventDefault(): void }) => Promise<void> {
  let handled = false;

  return async (event: { preventDefault(): void }): Promise<void> => {
    if (handled) return;
    handled = true;

    event.preventDefault();

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    await Promise.race([Promise.allSettled(flushes.map((f) => f())), timeout]);

    quit();
  };
}
