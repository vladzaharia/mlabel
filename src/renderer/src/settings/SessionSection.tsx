import { useState } from "react";
import type { SessionData } from "@core";
import { Button } from "../components/ui/button";
import { Dialog, DialogTitle, DialogDescription, DialogWarning } from "../components/ui/dialog";
import { useStore, selectCompletedCount } from "../store/store";
import { baseName } from "../lib/utils";
import { Empty, Fact, Panel, SettingsSection } from "./SettingsSection";

export function SessionSection({ session }: { session: SessionData | null }): React.JSX.Element {
  const records = useStore((s) => s.records);
  const index = useStore((s) => s.index);
  const inputPath = useStore((s) => s.inputPath);
  const configPath = useStore((s) => s.configPath);
  const prefill = useStore((s) => s.prefill);
  const done = useStore(selectCompletedCount);
  const clearSessionData = useStore((s) => s.clearSessionData);
  const [confirming, setConfirming] = useState(false);

  if (records.length === 0) {
    return (
      <SettingsSection title="This session">
        <Empty>Nothing in progress. Open a data file and MLabel starts remembering.</Empty>
      </SettingsSection>
    );
  }

  const answers = Object.entries(prefill).filter(([, value]) => value !== null && value !== "");
  const pct = records.length > 0 ? Math.round((done / records.length) * 100) : 0;

  return (
    <SettingsSection title="This session">
      <Panel>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-progress transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm tabular-nums">
          {done} of {records.length} labeled · you are on record {index + 1}
        </p>
      </Panel>

      <Panel>
        <Fact label="Config">{configPath ? baseName(configPath) : "—"}</Fact>
        <Fact label="Data">{inputPath ? baseName(inputPath) : "—"}</Fact>
        <Fact label="Fingerprint">
          {session?.source ? (
            <span className="font-mono text-xs">
              sha256 {session.source.sha256.slice(0, 8)}… · {session.source.size} bytes
            </span>
          ) : (
            <span className="text-muted-foreground">not stamped yet</span>
          )}
        </Fact>
        <Fact label="Answered once">
          {answers.length > 0 ? (
            answers.map(([field, value]) => `${field}: ${String(value)}`).join(" · ")
          ) : (
            <span className="text-muted-foreground">none</span>
          )}
        </Fact>
      </Panel>

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Clear this session</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Throws away the {done} label{done === 1 ? "" : "s"} you have entered, and the saved
              file with them.
            </p>
          </div>
          <Button variant="danger-outline" size="xs" onClick={() => setConfirming(true)}>
            Clear session
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogTitle>Clear this session?</DialogTitle>
        <DialogDescription>
          This deletes the {done} label{done === 1 ? "" : "s"} you have entered but not exported,
          and the saved session file with them. Your data file and any earlier exports are
          untouched.
        </DialogDescription>
        <DialogWarning>There is no undo. Export first if you want to keep this work.</DialogWarning>
        <div className="mt-4 flex justify-end gap-2">
          {/* DOM-first so it takes focus: the safe choice should be the one a
              stray Enter picks. */}
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
          <Button
            size="sm"
            variant="danger-outline"
            onClick={() => {
              setConfirming(false);
              void clearSessionData();
            }}
          >
            Clear session
          </Button>
        </div>
      </Dialog>
    </SettingsSection>
  );
}
