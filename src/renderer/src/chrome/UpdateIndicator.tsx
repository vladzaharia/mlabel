import { useStore } from "../store/store";
import { Button } from "../components/ui/button";
import { describeUpdateStatus } from "./update-status-view";

const baseClass =
  "no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground";
const buttonClass = "no-drag gap-1.5 font-normal text-muted-foreground hover:text-foreground";

/**
 * Subtle auto-update status, shown in the chrome bar (inline with "‹ Config").
 * Static for transient states; a button when the user can act (restart to
 * install, or download the portable build). Renders nothing until the first
 * status arrives, and nothing for states that have no business taking up room.
 */
export function UpdateIndicator(): React.JSX.Element | null {
  const status = useStore((s) => s.updateStatus);
  if (!status) return null;

  const view = describeUpdateStatus(status);
  if (view.quiet) return null;
  const { Icon } = view;

  if (view.action) {
    const { action } = view;
    return (
      <Button
        variant="ghost"
        size="xs"
        className={buttonClass}
        title={view.detail}
        onClick={() => {
          if (action.kind === "install") void window.api.installUpdate();
          else if (action.kind === "recheck") void window.api.checkForUpdates();
          else if (action.url) window.api.openExternal(action.url).catch(console.error);
        }}
      >
        <Icon size={13} aria-hidden="true" />
        {/* A button in the chrome bar says what pressing it does. The status
            itself — "0.4.0 is ready" — is the settings pane's job, where
            there is room for a title and a detail. */}
        {status.kind === "error" ? "Couldn’t check for updates — Retry" : action.label}
      </Button>
    );
  }

  return (
    <span className={baseClass}>
      <Icon
        size={13}
        aria-hidden="true"
        className={status.kind === "checking" ? "animate-spin [animation-duration:2s]" : undefined}
      />
      {view.title}
    </span>
  );
}
