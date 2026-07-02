import { useEffect, useRef } from "react";

/**
 * Returns a ref that, when attached to an element, focuses it on mount.
 * Apply to each screen's h1 with tabIndex={-1} so keyboard/AT users are
 * oriented after a route change without showing a visible focus ring.
 *
 * @example
 * function MyScreen() {
 *   const headingRef = useHeadingFocus();
 *   return <h1 ref={headingRef} tabIndex={-1} className="outline-none">Title</h1>;
 * }
 */
export function useHeadingFocus(): React.RefCallback<HTMLElement> {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (node: HTMLElement | null) => {
    ref.current = node;
  };
}
