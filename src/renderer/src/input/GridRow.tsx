import type { GridRow as GridRowConfig, InputField } from "@core/config";
import type { CoercedValue } from "@core";
import { WrapRow } from "../components/WrapRow";
import { InputFieldView } from "./InputFieldView";

/** A row of input fields; `columns` defaults to the field count. */
export function GridRow({
  row,
  fieldsByName,
  values,
}: {
  row: GridRowConfig;
  fieldsByName: Map<string, InputField>;
  values: Readonly<Record<string, CoercedValue>>;
}): React.JSX.Element {
  const items = row.fields.flatMap((name) => {
    const field = fieldsByName.get(name);
    if (!field) return [];
    return [{ key: name, node: <InputFieldView field={field} value={values[name]} /> }];
  });

  return (
    <WrapRow
      columns={row.columns ?? row.fields.length}
      itemMinWidthClass="min-w-48"
      items={items}
    />
  );
}
