import { useStore } from "../store/store";
import { usePrepareStore, type PrepareTab } from "../store/prepare-store";
import { Button } from "../components/ui/button";
import { SplitPanel } from "./SplitPanel";
import { JoinPanel } from "./JoinPanel";
import { useHeadingFocus } from "../a11y/useHeadingFocus";

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

        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {TABS.map(({ id, label }) => (
            <Button
              key={id}
              variant={tab === id ? "subtle" : "ghost"}
              size="sm"
              onClick={() => setTab(id)}
              className="flex-1"
            >
              {label}
            </Button>
          ))}
        </div>

        {tab === "split" && <SplitPanel />}
        {tab === "join-output" && <JoinPanel kind="output" />}
        {tab === "join-remaining" && <JoinPanel kind="remaining" />}
      </div>
    </div>
  );
}
