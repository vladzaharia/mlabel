import { Check, Download, Trash2 } from "lucide-react";
import type { AppInfo, ModelCallEntry } from "@core";
import { MODELS } from "@core";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { Callout } from "../components/Callout";
import { useStore } from "../store/store";
import { cn } from "../lib/utils";
import { ModelCalls } from "./ModelCalls";
import { Eyebrow, Panel, SettingsSection } from "./SettingsSection";

const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(2)} GB`;

/**
 * Turning on-device anomaly detection on, and choosing what runs.
 *
 * Only reachable when the config permits it — `SettingsDialog` removes the whole
 * section otherwise, rather than showing a switch that cannot be flipped.
 */
export function AiSection({
  info,
  calls,
}: {
  info: AppInfo | null;
  calls: readonly ModelCallEntry[];
}): React.JSX.Element {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const downloaded = useStore((s) => s.downloadedModels);
  const state = useStore((s) => s.aiState);
  const canDownload = info?.modelDownloadAllowedByConfig !== false;

  const downloading = state.kind === "downloading" ? state : null;

  return (
    <SettingsSection title="Anomaly detection">
      <Panel>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Look for anomalies</p>
          </div>
          <Switch
            label="Look for anomalies"
            checked={settings.aiEnabled}
            onCheckedChange={(checked) => void updateSettings({ aiEnabled: checked })}
          />
        </div>
      </Panel>

      {settings.aiEnabled && (
        <>
          <div>
            <Eyebrow>Model</Eyebrow>
            <div className="mt-1 divide-y divide-border/50 overflow-hidden rounded-lg border border-border">
              {MODELS.map((spec) => {
                const present = downloaded.includes(spec.id);
                const chosen = settings.aiModelId === spec.id;
                const busy = downloading?.modelId === spec.id;
                return (
                  <div key={spec.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className={cn(chosen && "font-medium")}>{spec.name}</span>
                        {present && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-progress-text">
                            <Check size={11} aria-hidden="true" />
                            On this machine
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {spec.note} · {gb(spec.bytes)} · {spec.parameters} · {spec.license}
                      </p>
                      {busy && downloading && (
                        <div className="mt-1.5">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-progress transition-[width]"
                              style={{
                                width: `${String(
                                  Math.round(
                                    (downloading.receivedBytes / downloading.totalBytes) * 100,
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                            {gb(downloading.receivedBytes)} of {gb(downloading.totalBytes)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {present && !chosen && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => void updateSettings({ aiModelId: spec.id })}
                        >
                          Use this
                        </Button>
                      )}
                      {present && (
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Delete ${spec.name}`}
                          onClick={() => void window.api.deleteModel(spec.id)}
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </Button>
                      )}
                      {!present && busy && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => void window.api.cancelModelDownload()}
                        >
                          Cancel
                        </Button>
                      )}
                      {!present && !busy && (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={!canDownload || downloading !== null}
                          onClick={() => void window.api.downloadModel(spec.id)}
                        >
                          <Download size={12} aria-hidden="true" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!canDownload && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                This config does not permit downloading a model. Anything already on this machine
                still works — it needs no network to run.
              </p>
            )}
          </div>

          {state.kind === "error" && <Callout tone="danger">{state.message}</Callout>}

          {/* The framing is the feature. A suggestion that looks like an answer
              is worse than no suggestion in a tool whose output is ground truth. */}
          <Callout tone="info">
            Anomaly detection is opt-in and uses on-device models to help detect anomalies in the
            data. All results should be reviewed.
          </Callout>

          <ModelCalls entries={calls} />
        </>
      )}
    </SettingsSection>
  );
}
