import type { Card, InputField } from "@core/config";
import { titleOf } from "@core/config";
import type { CoercedValue, DecorationMap } from "@core";
import { CardShell } from "../components/CardShell";
import { GridRow } from "./GridRow";

export function CategoryCard({
  card,
  fieldsByName,
  values,
  decorations,
  coercionErrors,
}: {
  card: Card;
  fieldsByName: Map<string, InputField>;
  values: Readonly<Record<string, CoercedValue>>;
  decorations: DecorationMap;
  coercionErrors: ReadonlyMap<string, string>;
}): React.JSX.Element {
  return (
    <CardShell
      displayName={titleOf(card.name, card.display)}
      description={card.display?.description}
      help={card.display?.help}
    >
      {card.rows.map((row, i) => (
        <GridRow
          key={i}
          row={row}
          fieldsByName={fieldsByName}
          values={values}
          decorations={decorations}
          coercionErrors={coercionErrors}
        />
      ))}
    </CardShell>
  );
}
