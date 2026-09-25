import type { Card, InputField } from "@core/config";
import { titleOf } from "@core/config";
import { toneOf, type CoercedValue, type Decorations } from "@core";
import { CardShell } from "../components/CardShell";
import { CardAnalysis } from "./CardAnalysis";
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
  /** Everything the rules said about this record, across all three scopes. */
  decorations: Decorations;
  coercionErrors: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const own = decorations.cards.get(card.name);
  return (
    <CardShell
      displayName={titleOf(card.name, card.display)}
      description={card.display?.description}
      help={card.display?.help}
      tone={toneOf(own)}
      // The notes are not passed here on purpose. They used to sit in a callout
      // under the card's heading, above the data they were about; they now
      // gather in the Analysis footer with the per-item tallies, which is the
      // only place the two can be read as one verdict on the group.
      footer={<CardAnalysis card={card} decorations={decorations} />}
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
