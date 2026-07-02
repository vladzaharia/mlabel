import { Tabs } from "radix-ui";
import { useStore } from "../store/store";
import { usePrepareStore, type PrepareTab } from "../store/prepare-store";
import { SplitPanel } from "./SplitPanel";
import { JoinPanel } from "./JoinPanel";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { cn } from "../lib/utils";

const TABS: { id: PrepareTab; label: string }[] = [
  { id: "split", label: "Split input" },
  { id: "join-output", label: "Join outputs" },
  { id: "join-remaining", label: "Join remaining" },
];

/** Prepare mode: split one input into parts, or join output/remaining files. */
export function PrepareView(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const tab = usePrepareStore((s) => s.tab);
  const setTab = usePrepareStore((s) => s.setTab);
  const headingRef = useHeadingFocus();

  const inputColumns = config?.input.fields.map((f) => f.name).join(", ") ?? "";
  const outputColumns = config?.output.fields.map((f) => f.name).join(", ") ?? "";

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
        <header>
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            Prepare data
          </h1>
          <p className="text-muted-foreground mt-1 truncate text-xs" title={inputColumns}>
            Input schema: {inputColumns}
          </p>
          <p className="text-muted-foreground truncate text-xs" title={outputColumns}>
            Output schema: {outputColumns}
          </p>
        </header>

        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as PrepareTab)}>
          <Tabs.List
            aria-label="Prepare actions"
            className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1"
          >
            {TABS.map(({ id, label }) => (
              <Tabs.Trigger
                key={id}
                value={id}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "select-none disabled:pointer-events-none disabled:opacity-50",
                  "hover:bg-muted",
                  "data-[state=active]:bg-muted data-[state=active]:text-foreground",
                  "data-[state=inactive]:text-muted-foreground",
                )}
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="split">
            <SplitPanel />
          </Tabs.Content>
          <Tabs.Content value="join-output">
            <JoinPanel kind="output" />
          </Tabs.Content>
          <Tabs.Content value="join-remaining">
            <JoinPanel kind="remaining" />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}
