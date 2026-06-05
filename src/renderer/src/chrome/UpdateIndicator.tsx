import { AlertCircle, Check, Download, RefreshCw, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStore } from "../store/store";
import { cn } from "../lib/utils";

const baseClass =
  "no-drag flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground";
const buttonClass = cn(baseClass, "hover:bg-muted hover:text-foreground");

/**
 * Subtle auto-update status, shown in the chrome bar (inline with "‹ Config").
 * Static for transient states; a button when the user can act (restart to
 * install, or download the portable build). Renders nothing until the first
 * status arrives — and stays hidden when update checks are disabled.
 */
export function UpdateIndicator(): React.JSX.Element | null {
  const status = useStore((s) => s.updateStatus);
  if (!status) return null;

  switch (status.kind) {
    case "checking":
      return <Static icon={RefreshCw} spin label="Checking for updates…" />;
    case "up-to-date":
      return <Static icon={Check} label="Up to date" />;
    case "downloading":
      return <Static icon={Download} label={`Downloading update… ${String(status.percent)}%`} />;
    case "downloaded":
      return (
        <button
          type="button"
          className={buttonClass}
          onClick={() => void window.api.installUpdate()}
        >
          <RotateCw size={13} /> Restart to update
        </button>
      );
    case "available-external": {
      const url = status.url;
      return (
        <button
          type="button"
          className={buttonClass}
          onClick={() => void window.api.openExternal(url)}
        >
          <Download size={13} /> Update available
        </button>
      );
    }
    case "error":
      return (
        <span className={baseClass} title={status.message ?? undefined}>
          <AlertCircle size={13} /> Couldn’t check for updates
        </span>
      );
  }
}

function Static({
  icon: Icon,
  label,
  spin,
}: {
  icon: LucideIcon;
  label: string;
  spin?: boolean;
}): React.JSX.Element {
  return (
    <span className={baseClass}>
      <Icon size={13} className={spin ? "animate-spin [animation-duration:2s]" : undefined} />
      {label}
    </span>
  );
}
