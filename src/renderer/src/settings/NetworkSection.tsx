import { Lock } from "lucide-react";
import type { AppInfo, NetworkLogEntry } from "@core";
import { SEVERITY } from "../components/Severity";
import { useStore } from "../store/store";
import { Switch } from "../components/ui/switch";
import { Eyebrow, Panel, SettingsSection } from "./SettingsSection";
import { cn } from "../lib/utils";

const OUTCOME_CLASS: Record<NetworkLogEntry["outcome"], string> = {
  success: "text-progress-text",
  denied: "text-warning-text",
  error: "text-danger-text",
  started: "text-muted-foreground",
};

const time = (at: number): string => new Date(at).toLocaleTimeString();

export function NetworkSection({
  info,
  entries,
}: {
  info: AppInfo | null;
  entries: readonly NetworkLogEntry[];
}): React.JSX.Element {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const lockedByConfig = info?.updatesAllowedByConfig === false;
  const denied = entries.filter((e) => e.outcome === "denied").length;

  return (
    <SettingsSection title="Network">
      <Panel>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {lockedByConfig && <Lock size={12} aria-hidden="true" />}
              Check GitHub for updates
            </p>
            {/* Only says something when there is something to say: that the
                toggle cannot be moved, and why. */}
            {lockedByConfig && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                This config sets network.updateChecks to false. The gate sits below the app —
                nothing here can open it.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <Switch
              label="Check GitHub for updates"
              checked={!lockedByConfig && settings.updateChecks}
              disabled={lockedByConfig}
              onCheckedChange={(checked) => void updateSettings({ updateChecks: checked })}
            />
            {lockedByConfig ? "Off, by config" : settings.updateChecks ? "On" : "Off"}
          </div>
        </div>
      </Panel>

      <div>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Recent calls</Eyebrow>
          <span className="text-[11px] text-muted-foreground">
            {/* A blocked request is the one thing the list does not announce on
                its own — it is a coloured row among rows. Everything else here
                is plainly readable from the log itself. */}
            {denied > 0 && (
              <span className={cn("mr-2", SEVERITY.warning.textClass)}>
                {denied === 1 ? "1 blocked" : `${String(denied)} blocked`}
              </span>
            )}
            this session · last 50
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing to show. That is the whole feature.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-border/50 overflow-hidden rounded-lg border border-border">
            {entries.toReversed().map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 px-3 py-1.5 text-xs">
                <span className={cn("w-32 shrink-0 truncate", OUTCOME_CLASS[entry.outcome])}>
                  {entry.label}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {entry.host}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {entry.detail ?? entry.outcome}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {time(entry.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsSection>
  );
}
