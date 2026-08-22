import type { CardRow, InputField } from "@core/config";
import type { CoercedValue } from "@core";
import { WrapRow } from "../components/WrapRow";
import { InputFieldView } from "./InputFieldView";

/** A row of input fields; `perRow` defaults to the number of fields in the row. */
export function GridRow({
  row,
  fieldsByName,
  values,
}: {
  row: CardRow;
  fieldsByName: Map<string, InputField>;
  values: Readonly<Record<string, CoercedValue>>;
}): React.JSX.Element {
  const items = row.use.flatMap((name) => {
    const field = fieldsByName.get(name);
    if (!field) return [];
    return [{ key: name, node: <InputFieldView field={field} value={values[name]} /> }];
  });

  return (
    <WrapRow columns={row.perRow ?? row.use.length} itemMinWidthClass="min-w-48" items={items} />
  );
}
