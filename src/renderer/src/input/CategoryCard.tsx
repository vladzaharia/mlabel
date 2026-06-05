import type { Category, InputField } from "@core/config";
import type { CoercedValue } from "@core";
import { CardShell } from "../components/CardShell";
import { GridRow } from "./GridRow";

export function CategoryCard({
  category,
  fieldsByName,
  values,
}: {
  category: Category;
  fieldsByName: Map<string, InputField>;
  values: Readonly<Record<string, CoercedValue>>;
}): React.JSX.Element {
  return (
    <CardShell
      displayName={category.displayName}
      description={category.description}
      help={category.help}
    >
      {category.rows.map((row, i) => (
        <GridRow key={i} row={row} fieldsByName={fieldsByName} values={values} />
      ))}
    </CardShell>
  );
}
