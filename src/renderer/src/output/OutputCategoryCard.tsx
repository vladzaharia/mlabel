import type { GridRow as GridRowConfig, OutputField } from "@core/config";
import { isAutoCopied, type CoercedValue, type LabelMap } from "@core";
import { CardShell } from "../components/CardShell";
import { FieldRenderer } from "./FieldRenderer";

/** A category-shaped grouping of output fields (header optional for implicit cards). */
export interface OutputCategory {
  displayName?: string;
  description?: string;
  help?: string;
  rows: GridRowConfig[];
}

export function OutputCategoryCard({
  category,
  fieldsByName,
  values,
  inputNames,
  onChange,
}: {
  category: OutputCategory;
  fieldsByName: Map<string, OutputField>;
  values: LabelMap;
  inputNames: ReadonlySet<string>;
  onChange: (field: string, value: CoercedValue | null) => void;
}): React.JSX.Element {
  return (
    <CardShell
      displayName={category.displayName}
      description={category.description}
      help={category.help}
    >
      {category.rows.map((row, i) => (
        <OutputRow
          key={i}
          row={row}
          fieldsByName={fieldsByName}
          values={values}
          inputNames={inputNames}
          onChange={onChange}
        />
      ))}
    </CardShell>
  );
}

function OutputRow({
  row,
  fieldsByName,
  values,
  inputNames,
  onChange,
}: {
  row: GridRowConfig;
  fieldsByName: Map<string, OutputField>;
  values: LabelMap;
  inputNames: ReadonlySet<string>;
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
