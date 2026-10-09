import { useEffect, useRef, useState } from "react";
import { Tabs } from "radix-ui";
import { History, Keyboard, Radio, Sparkles, SlidersHorizontal, ArrowUpCircle } from "lucide-react";
import type { AppInfo, ModelCallEntry, NetworkLogEntry, SessionData } from "@core";
import { useStore } from "../store/store";
import { Dialog, DialogDescription, DialogTitle } from "../components/ui/dialog";
import { describeUpdateStatus } from "../chrome/update-status-view";
import { cn } from "../lib/utils";
import { KeysSection } from "./KeysSection";
import { VersionSection } from "./VersionSection";
import { ConfigSection } from "./ConfigSection";
import { SessionSection } from "./SessionSection";
import { NetworkSection } from "./NetworkSection";
import { AiSection } from "./AiSection";

interface SectionDef {
  id: string;
  label: string;
  Icon: typeof Keyboard;
  /**
   * Whether this section exists at all for the loaded config.
   *
   * A capability a config has switched off is **absent**, not shown greyed out.
   * A disabled control still advertises a feature, and invites someone to go
   * looking for the switch that turns it on — when the answer is that this
   * deployment does not have it.
   */
  available?: (info: AppInfo | null) => boolean;
}

const SECTIONS: readonly SectionDef[] = [
  { id: "keys", label: "Keys", Icon: Keyboard },
  { id: "version", label: "Version", Icon: ArrowUpCircle },
  { id: "config", label: "Config", Icon: SlidersHorizontal },
  { id: "session", label: "Session", Icon: History },
  {
    id: "ai",
    label: "Anomalies",
    Icon: Sparkles,
    // Present when the config permits the feature *and* there is some way for
    // it to work — a model already here, or permission to fetch one. See
    // `anomalyUnavailableReason`, which states the rule once.
    available: (info) =>
      info === null ||
      (info.aiPlatformSupported &&
        info.aiAllowedByConfig &&
        (info.modelDownloadAllowedByConfig || hasModel())),
  },
  {
    id: "network",
    label: "Network",
    Icon: Radio,
    available: (info) => info === null || info.updatesAllowedByConfig,
  },
];

/** Read outside the component so `available` can stay a plain predicate. */
const hasModel = (): boolean => useStore.getState().downloadedModels.length > 0;

/**
 * Everything this copy of MLabel is doing, and what can be changed about it.
 *
 * A modal dialog rather than a mode or a phase, and that is not a style choice:
 * `useKeyboardShortcuts` surrenders the keyboard to any open dialog. Recording a
 * new shortcut anywhere else would fire the very shortcuts being rebound —
 * pressing `C` to record it would also answer the record behind you.
 *
 * A rail rather than tabs across the top, because the Keys section alone can run
 * to sixty rows and would bury Network — whose whole job is reassurance — under
 * several screens of scrolling.
 */
export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [section, setSection] = useState<string>("keys");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [entries, setEntries] = useState<readonly NetworkLogEntry[]>([]);
  const [calls, setCalls] = useState<readonly ModelCallEntry[]>([]);
  /**
   * How to call off a recording in progress, or null when there is none.
   *
   * A ref rather than state, deliberately: Radix's Escape handler is a plain
   * document listener, and whether a React state update has committed by the
   * time it runs is not something to rely on. A ref is set synchronously, so
   * the guard is up the instant recording starts.
   */
  const cancelCapture = useRef<(() => void) | null>(null);
  const status = useStore((s) => s.updateStatus);
  const pickConfig = useStore((s) => s.pickConfig);
  const backToConfig = useStore((s) => s.backToConfig);
  const completed = useStore((s) => Object.keys(s.labels).length);

  useEffect(() => {
    if (!open) return;
    void window.api.getAppInfo().then(setInfo);
    void window.api.getSessionInfo().then(setSession);
    void window.api.getNetworkLog().then(setEntries);
    void window.api.getModelLog().then(setCalls);
  }, [open]);

  // Held in the dialog rather than the global store: fifty rows nobody is
  // looking at have no business living for the whole session.
  useEffect(() => {
    if (!open) return;
    return window.api.onNetworkLog((entry) => setEntries((prev) => [...prev, entry]));
  }, [open]);

  // A model call is pushed twice — once as it starts, once as it lands — so the
  // second push replaces the first rather than appending a duplicate row.
  useEffect(() => {
    if (!open) return;
    return window.api.onModelCall((entry) =>
      setCalls((prev) => {
        const at = prev.findIndex((existing) => existing.id === entry.id);
        if (at === -1) return [...prev, entry];
        const next = [...prev];
        next[at] = entry;
        return next;
      }),
    );
  }, [open]);

  const onChangeConfig = (): void => {
    onOpenChange(false);
    // Switching config drops the loaded input and every unexported label with
    // it, so the labeler goes back to the start screen deliberately rather than
    // finding themselves there.
    if (completed > 0) backToConfig();
    void pickConfig();
  };

  const version = info?.version;
  const statusLine = status ? describeUpdateStatus(status) : null;
  const sections = SECTIONS.filter((s) => s.available?.(info) ?? true);
  // A config can switch off the section the labeler was last looking at.
  const activeSection = sections.some((s) => s.id === section) ? section : "keys";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="panel"
      onEscapeKeyDown={(event) => {
        // While recording, Escape means "cancel that", not "close the pane".
        if (!cancelCapture.current) return;
        event.preventDefault();
        cancelCapture.current();
        cancelCapture.current = null;
      }}
      onInteractOutside={(event) => {
        if (cancelCapture.current) event.preventDefault();
      }}
    >
      <header className="shrink-0 border-b border-border px-6 pb-4 pt-5">
        <DialogTitle>Settings</DialogTitle>
        {/* Kept for `aria-describedby`, which Radix wants and a screen reader
            uses to announce the dialog, but not shown: on screen it restated
            the word "Settings" at greater length and pushed the tabs down. */}
        <DialogDescription className="sr-only">
          Everything this copy of MLabel is doing, and what you can change about it.
        </DialogDescription>
      </header>

      <Tabs.Root
        value={activeSection}
        onValueChange={setSection}
        orientation="vertical"
        activationMode="manual"
        className="flex min-h-0 flex-1 flex-col md:flex-row"
      >
        <Tabs.List
          aria-label="Settings sections"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2 md:w-[196px] md:flex-col md:overflow-x-visible md:border-b-0 md:border-r"
        >
          {sections.map(({ id, label, Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "data-[state=active]:bg-accent/10 data-[state=active]:font-medium data-[state=active]:text-accent",
                "md:justify-start md:border-l-2 md:border-transparent data-[state=active]:md:border-accent",
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </Tabs.Trigger>
          ))}
          {/* Gives the rail some weight, and answers "what am I running" at a
              glance without anyone having to go looking for it. */}
          <div className="mt-auto hidden border-t border-border px-3 pt-2 md:block">
            <p className="text-xs tabular-nums text-muted-foreground">MLabel {version ?? "…"}</p>
            {statusLine && !statusLine.quiet && (
              <p className="truncate text-[11px] text-muted-foreground">{statusLine.title}</p>
            )}
          </div>
        </Tabs.List>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Tabs.Content value="keys">
            <KeysSection
              onCapturingChange={(active, cancel) => {
                cancelCapture.current = active ? (cancel ?? null) : null;
              }}
            />
          </Tabs.Content>
          <Tabs.Content value="version">
            <VersionSection info={info} />
          </Tabs.Content>
          <Tabs.Content value="config">
            <ConfigSection onChangeConfig={onChangeConfig} />
          </Tabs.Content>
          <Tabs.Content value="session">
            <SessionSection session={session} />
          </Tabs.Content>
          {sections.some((s) => s.id === "ai") && (
            <Tabs.Content value="ai">
              <AiSection info={info} calls={calls} />
            </Tabs.Content>
          )}
          {sections.some((s) => s.id === "network") && (
            <Tabs.Content value="network">
              <NetworkSection info={info} entries={entries} />
            </Tabs.Content>
          )}
        </div>
      </Tabs.Root>
    </Dialog>
  );
}
