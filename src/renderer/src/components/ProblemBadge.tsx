import { SEVERITY, type SeverityKind } from "./Severity";
import { Tooltip } from "./ui/tooltip";

/**
 * A problem with one value, collapsed to an icon.
 *
 * A record can carry a dozen unreadable cells, and a dozen full-width warning
 * boxes bury the data the labeler is actually here to read. The icon keeps the
 * fact visible in the caption gutter and defers the explanation to a hover or a
 * focus.
 *
 * Deliberately a `Tooltip` rather than a `HelpBubble`: the popover is
 * click-only, and it hard-codes `aria-label="Help"` — which is the wrong name
 * for something reporting a failure. The tooltip opens on hover *and* on focus,
 * stays open while the pointer is over it, and dismisses on Escape, which is
 * WCAG 1.4.13 without any extra work. The message is also the button's
 * accessible name, so it is announced on focus whether or not the tip opens.
 */
export function ProblemBadge({
  message,
  tone = "warning",
}: {
  message: string;
  tone?: SeverityKind;
}): React.JSX.Element {
  const { Icon, textClass } = SEVERITY[tone];
  return (
    <Tooltip content={message}>
      <button
        type="button"
        aria-label={message}
        className={`no-drag -m-1 inline-flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${textClass}`}
      >
        <Icon size={13} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
