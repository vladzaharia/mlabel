import type { GridRow as GridRowConfig, InputField } from "@core/config";
import type { CoercedValue } from "@core";
import { InputFieldView } from "./InputFieldView";

/**
 * A row of input fields. Fields flow with flex-wrap; `columns` (default = field
 * count) sets each item's flex-basis so the row keeps at least that many columns
 * when wide and wraps to fewer on narrow widths ("minimum columns").
 */
export function GridRow({
  row,
  fieldsByName,
  values,
}: {
  row: GridRowConfig;
  fieldsByName: Map<string, InputField>;
  values: Readonly<Record<string, CoercedValue>>;
}): React.JSX.Element {
  const columns = row.columns ?? row.fields.length;
  const basis = `calc(${(100 / columns).toFixed(4)}% - 1.5rem)`;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {row.fields.map((name) => {
        const field = fieldsByName.get(name);
        if (!field) return null;
        return (
          <div key={name} className="min-w-48" style={{ flexBasis: basis, flexGrow: 1 }}>
            <InputFieldView field={field} value={values[name]} />
          </div>
        );
      })}
    </div>
  );
}
