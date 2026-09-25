import type { AppInfo } from "@core";
import { Button } from "../components/ui/button";
import { SEVERITY } from "../components/Severity";
import { useStore } from "../store/store";
import { describeUpdateStatus } from "../chrome/update-status-view";
import { Fact, Panel, SettingsSection } from "./SettingsSection";

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

/**
 * Platform and architecture together.
 *
 * The arch is not a detail here: this app ships inference for arm64 macOS only,
 * so "macOS" on its own does not tell a labeler whether anomaly detection can
 * work on their machine. Falls back to the raw `process` values rather than
 * hiding an unrecognised platform behind a dash.
 */
const runningOn = (info: AppInfo | null): string => {
  if (!info) return "…";
  return `${PLATFORM_NAMES[info.platform] ?? info.platform} · ${info.arch}`;
};

export function VersionSection({ info }: { info: AppInfo | null }): React.JSX.Element {
  const status = useStore((s) => s.updateStatus);
  const view = status ? describeUpdateStatus(status) : null;

  return (
    <SettingsSection title="Version and updates">
      <Panel>
        <Fact label="MLabel">
          <span className="tabular-nums">{info?.version ?? "…"}</span>
        </Fact>
        <Fact label="Running on">{runningOn(info)}</Fact>
      </Panel>

      <Panel>
        {view ? (
          <div className="flex items-start gap-2">
            <view.Icon
              size={14}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${SEVERITY[view.tone].textClass}`}
            />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${SEVERITY[view.tone].textClass}`}>{view.title}</p>
              {view.detail && (
                <p className="mt-0.5 break-words font-mono text-xs text-muted-foreground">
                  {view.detail}
                </p>
              )}
            </div>
            {view.action && (
              <Button
                size="xs"
                variant={view.action.kind === "install" ? "default" : "outline"}
                onClick={() => {
                  const { kind, url } = view.action!;
                  if (kind === "install") void window.api.installUpdate();
                  else if (kind === "recheck") void window.api.checkForUpdates();
                  else if (url) window.api.openExternal(url).catch(console.error);
                }}
              >
                {view.action.label}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {/* Honest, rather than a reassuring "up to date" that was never
                checked. Development builds check too, so there is nothing
                build-specific left to explain here. */}
            <p className="text-sm text-muted-foreground">No update check has run yet.</p>
            <Button
              size="xs"
              variant="outline"
              disabled={info?.updatesArmed !== true}
              onClick={() => void window.api.checkForUpdates()}
            >
              Check now
            </Button>
          </div>
        )}
      </Panel>
    </SettingsSection>
  );
}
