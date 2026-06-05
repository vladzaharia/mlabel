import { useMemo } from "react";
import type { GridRow as GridRowConfig } from "@core/config";
import { isAutoCopied, type CoercedValue, type LabelMap, type OutputField } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { FieldRenderer } from "./FieldRenderer";

/** A category-shaped grouping of output fields (heading optional for implicit). */
interface OutputSection {
  displayName?: string;
  rows: GridRowConfig[];
}

export function OutputForm(): React.JSX.Element | null {
  const config = useStore((s) => s.config);
  const index = useStore((s) => s.index);
  const record = useStore(selectCurrentRecord);
  const labels = useStore((s) => s.labels[s.index]);
  const setLabel = useStore((s) => s.setLabel);

  const { fieldsByName, inputNames, sections } = useMemo(() => {
    const byName = new Map<string, OutputField>(
      (config?.output.fields ?? []).map((f) => [f.name, f]),
    );
    const names = new Set(config?.input.fields.map((f) => f.name));
    const secs: OutputSection[] =
      config?.output.categories ?? implicitSections(config?.output.fields ?? [], names);
    return { fieldsByName: byName, inputNames: names, sections: secs };
  }, [config]);

  if (!config || !record || !hasVisibleField(config.output.fields, inputNames)) return null;
  const current: LabelMap = labels ?? record.labelValues;
  const onChange = (field: string, value: CoercedValue | null): void =>
    setLabel(index, field, value);

  return (
    <div className="glass shrink-0 border-t border-border">
      <div className="max-h-[28vh] w-full space-y-4 overflow-auto px-6 py-3">
        {sections.map((section, si) => (
          <div key={si} className="space-y-2">
            {section.displayName && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.displayName}
              </h3>
            )}
            {section.rows.map((row, ri) => (
              <OutputRow
                key={ri}
                row={row}
                fieldsByName={fieldsByName}
                inputNames={inputNames}
                values={current}
                onChange={onChange}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputRow({
  row,
  fieldsByName,
  inputNames,
  values,
  onChange,
}: {
  row: GridRowConfig;
  fieldsByName: Map<string, OutputField>;
  inputNames: ReadonlySet<string>;
  values: LabelMap;
  onChange: (field: string, value: CoercedValue | null) => void;
}): React.JSX.Element | null {
  const fields = row.fields
    .map((name) => fieldsByName.get(name))
    .filter((f): f is OutputField => Boolean(f) && !isAutoCopied(f!, inputNames));
  if (fields.length === 0) return null;

  const columns = row.columns ?? fields.length;
  const basis = `calc(${(100 / columns).toFixed(4)}% - 1.5rem)`;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {fields.map((field) => (
        <div key={field.name} className="min-w-56" style={{ flexBasis: basis, flexGrow: 1 }}>
          <FieldRenderer
            field={field}
            value={values[field.name] ?? null}
            onChange={(value) => onChange(field.name, value)}
          />
        </div>
      ))}
    </div>
  );
}

function hasVisibleField(fields: readonly OutputField[], inputNames: ReadonlySet<string>): boolean {
  return fields.some((f) => !isAutoCopied(f, inputNames));
}

/** When no output.categories are configured, show every visible field one per row. */
function implicitSections(
  fields: readonly OutputField[],
  inputNames: ReadonlySet<string>,
): OutputSection[] {
  const visible = fields.filter((f) => !isAutoCopied(f, inputNames));
  if (visible.length === 0) return [];
  return [{ rows: visible.map((f) => ({ fields: [f.name] })) }];
}
