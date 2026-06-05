import { useMemo } from "react";
import { isAutoCopied, type LabelMap, type OutputField } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { FieldRenderer } from "./FieldRenderer";

interface RenderRow {
  group?: string;
  columns: number;
  fields: OutputField[];
}

/**
 * Build the rows to render. Uses the explicit `output.layout` when present
 * (rows of side-by-side fields); otherwise falls back to one field per row,
 * grouped by each field's `group`. Auto-copied (hidden / name-matched) fields
 * are never rendered.
 */
function buildRows(
  fields: OutputField[],
  layout: { group?: string; columns?: number; fields: string[] }[] | undefined,
  inputNames: ReadonlySet<string>,
): RenderRow[] {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const visible = (f: OutputField): boolean => !isAutoCopied(f, inputNames);

  if (layout) {
    return layout
      .map((row) => {
        const rowFields = row.fields
          .map((n) => byName.get(n))
          .filter((f): f is OutputField => Boolean(f) && visible(f!));
        return { group: row.group, columns: row.columns ?? rowFields.length, fields: rowFields };
      })
      .filter((row) => row.fields.length > 0);
  }

  return fields
    .filter(visible)
    .map((field) => ({ group: field.group, columns: 1, fields: [field] }));
}

export function OutputForm(): React.JSX.Element | null {
  const config = useStore((s) => s.config);
  const index = useStore((s) => s.index);
  const record = useStore(selectCurrentRecord);
  const labels = useStore((s) => s.labels[s.index]);
  const setLabel = useStore((s) => s.setLabel);

  const rows = useMemo(() => {
    if (!config) return [];
    const inputNames = new Set(config.input.fields.map((f) => f.name));
    return buildRows(config.output.fields, config.output.layout, inputNames);
  }, [config]);

  if (!config || !record || rows.length === 0) return null;
  const current: LabelMap = labels ?? record.labelValues;

  let lastGroup: string | undefined;

  return (
    <div className="glass shrink-0 border-t border-border">
      <div className="max-h-[28vh] w-full space-y-3 overflow-auto px-6 py-3">
        {rows.map((row, ri) => {
          const showHeading = row.group && row.group !== lastGroup;
          lastGroup = row.group;
          const basis = `calc(${(100 / row.columns).toFixed(4)}% - 1rem)`;
          return (
            <div key={ri} className="space-y-2">
              {showHeading && (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {row.group}
                </h3>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-3">
                {row.fields.map((field) => (
                  <div
                    key={field.name}
                    className="min-w-56"
                    style={{ flexBasis: basis, flexGrow: 1 }}
                  >
                    <FieldRenderer
                      field={field}
                      value={current[field.name] ?? null}
                      onChange={(value) => setLabel(index, field.name, value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
