import type { Card, InputField } from "@core/config";
import { titleOf } from "@core/config";
import type { CoercedValue } from "@core";
import { CardShell } from "../components/CardShell";
import { GridRow } from "./GridRow";

export function CategoryCard({
  card,
  fieldsByName,
  values,
}: {
  card: Card;
  fieldsByName: Map<string, InputField>;
  values: Readonly<Record<string, CoercedValue>>;
}): React.JSX.Element {
  return (
    <CardShell
      displayName={titleOf(card.name, card.display)}
      description={card.display?.description}
      help={card.display?.help}
    >
      {card.rows.map((row, i) => (
        <GridRow key={i} row={row} fieldsByName={fieldsByName} values={values} />
      ))}
    </CardShell>
  );
}
