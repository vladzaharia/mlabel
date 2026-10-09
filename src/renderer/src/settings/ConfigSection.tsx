import { summarizeConfig, type SummaryGroup } from "@core";
import { Button } from "../components/ui/button";
import { useStore } from "../store/store";
import { baseName } from "../lib/utils";
import { Empty, Eyebrow, Panel, SettingsSection } from "./SettingsSection";

const GROUPS: { id: SummaryGroup; title: string }[] = [
  { id: "format", title: "Data format" },
  { id: "reads", title: "Reads" },
  { id: "writes", title: "Writes" },
  { id: "also", title: "Additional config" },
];

export function ConfigSection({
  onChangeConfig,
}: {
  onChangeConfig: () => void;
}): React.JSX.Element {
  const config = useStore((s) => s.config);
  const configPath = useStore((s) => s.configPath);

  if (!config) {
    return (
      <SettingsSection title="What this config declares">
        <Empty>No config loaded.</Empty>
        <div>
          <Button size="xs" variant="outline" onClick={onChangeConfig}>
            Choose a config…
          </Button>
        </div>
      </SettingsSection>
    );
  }

  const items = summarizeConfig(config);

  return (
    <SettingsSection
      title="What this config declares"
      action={
        <Button size="xs" variant="outline" onClick={onChangeConfig}>
          Change…
        </Button>
      }
    >
      <Panel>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{configPath ? baseName(configPath) : "—"}</p>
            {configPath && (
              <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                {configPath}
              </p>
            )}
          </div>
          {configPath && (
            <Button
              size="xs"
              variant="ghost"
              className="shrink-0"
              onClick={() => void window.api.revealPath(configPath)}
            >
              Show in folder
            </Button>
          )}
        </div>
      </Panel>

      {GROUPS.map(({ id, title }) => {
        const rows = items.filter((item) => item.group === id);
        if (rows.length === 0) return null;
        // A group of pure statements gets no numeric gutter — a column of "·"
        // is an empty table, not an aligned one.
        const counted = rows.some((row) => row.count !== undefined);
        return (
          <div key={id}>
            <Eyebrow>{title}</Eyebrow>
            <ul className="mt-1 flex flex-col gap-1.5">
              {rows.map((row) => (
                <li key={row.label} className="flex items-baseline gap-3">
                  {/* The number is the anchor and the qualifier is the point:
                      "8 output fields" is a tally, "5 you answer · 2 copied in"
                      is a shape. */}
                  {counted && (
                    <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">
                      {row.count ?? "·"}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="text-sm">{row.label}</span>
                    {row.detail && (
                      <span className="ml-2 text-xs text-muted-foreground">{row.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </SettingsSection>
  );
}
