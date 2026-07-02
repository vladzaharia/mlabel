import { useAnnouncer } from "./announcer";

/**
 * Two permanently-mounted visually-hidden live regions.
 * Must be rendered once before any content that might announce —
 * a live region that doesn't pre-exist in the DOM will miss its first message.
 *
 * Rendered by App next to <Toaster />.
 *
 * <output> is the semantic equivalent of role="status" (polite) per the
 * HTML spec; jsx-a11y prefers it over role="status" on a <div>.
 */
export function LiveAnnouncer(): React.JSX.Element {
  const polite = useAnnouncer((s) => s.polite);
  const assertive = useAnnouncer((s) => s.assertive);

  return (
    <>
      {/* <output> carries implicit role="status" — polite live region */}
      <output
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        // key forces a DOM text node re-insertion on repeated identical messages
        key={`polite-${polite.seq}`}
      >
        {polite.message}
      </output>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        key={`assertive-${assertive.seq}`}
      >
        {assertive.message}
      </div>
    </>
  );
}
