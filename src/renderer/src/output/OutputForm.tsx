import { useMemo } from "react";
import { isAutoCopied, type OutputField } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { FieldRenderer } from "./FieldRenderer";

function groupFields(fields: OutputField[]): [string, OutputField[]][] {
  const groups = new Map<string, OutputField[]>();
  for (const field of fields) {
    const key = field.group ?? "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(field);
  }
  return [...groups.entries()];
}

export function OutputForm(): React.JSX.Element | null {
  const config = useStore((s) => s.config);
  const index = useStore((s) => s.index);
  const record = useStore(selectCurrentRecord);
  const labels = useStore((s) => s.labels[s.index]);
  const setLabel = useStore((s) => s.setLabel);

  const { visible, grouped } = useMemo(() => {
    const inputNames = new Set(config?.input.fields.map((f) => f.name));
    const vis = (config?.output.fields ?? []).filter((f) => !isAutoCopied(f, inputNames));
    return { visible: vis, grouped: groupFields(vis) };
  }, [config]);

  if (!config || !record || visible.length === 0) return null;
  const current = labels ?? record.labelValues;

  return (
    <div className="glass shrink-0 border-t border-border">
      <div className="mx-auto max-h-[42vh] w-full max-w-4xl space-y-5 overflow-auto p-5">
        {grouped.map(([groupName, fields]) => (
          <div key={groupName} className="space-y-3">
            {groupName && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {groupName}
              </h3>
            )}
            {fields.map((field) => (
              <FieldRenderer
                key={field.name}
                field={field}
                value={current[field.name] ?? null}
                onChange={(value) => setLabel(index, field.name, value)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
