import { AlertCircle, Check, Download, Lock, RefreshCw, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UpdateStatus } from "@core";
import type { SeverityKind } from "../components/Severity";

/**
 * One reading of an update status, for every surface that shows one.
 *
 * The chrome bar wants a terse line; the settings pane wants a title, a detail
 * and an action. Both used to be free to invent their own wording, which is how
 * two spellings of the same state drift apart — the same reason `SEVERITY`
 * exists. One table, two renderers.
 */
export interface UpdateView {
  tone: SeverityKind;
  Icon: LucideIcon;
  /** Terse label for the chrome bar. */
  title: string;
  /** Longer explanation, shown only where there is room. */
  detail?: string;
  /** What the labeler can do about it, if anything. */
  action?: { label: string; kind: "install" | "open-url" | "recheck"; url?: string };
  /** Whether the chrome bar renders this at all. */
  quiet?: boolean;
}

export function describeUpdateStatus(status: UpdateStatus): UpdateView {
  switch (status.kind) {
    case "checking":
      return { tone: "muted", Icon: RefreshCw, title: "Checking for updates…" };
    case "up-to-date":
      return { tone: "success", Icon: Check, title: "Up to date" };
    case "downloading":
      return {
        tone: "accent",
        Icon: Download,
        title: `Downloading update… ${String(status.percent)}%`,
        detail: `Version ${status.version}`,
      };
    case "downloaded":
      return {
        tone: "success",
        Icon: RotateCw,
        title: `${status.version} is ready`,
        action: { label: "Restart to update", kind: "install" },
      };
    case "available-external":
      return {
        tone: "info",
        Icon: Download,
        title: `${status.version} is available`,
        detail: "This build can’t replace itself — download it and swap it in by hand.",
        action: { label: "Open release page", kind: "open-url", url: status.url },
      };
    case "error":
      return {
        tone: "danger",
        Icon: AlertCircle,
        title: "Couldn’t check for updates",
        detail: status.message,
        action: { label: "Try again", kind: "recheck" },
      };
    case "disabled":
      return {
        tone: "muted",
        Icon: Lock,
        title: "Update checks are off",
        detail: "MLabel is not contacting anything.",
        // Nothing to say in the chrome bar: "off" is the resting state, and a
        // permanent badge announcing it would be noise on every screen.
        quiet: true,
      };
  }
}
