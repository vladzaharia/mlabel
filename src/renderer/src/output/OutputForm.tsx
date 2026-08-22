import type { Card, CardRow } from "@core/config";
import { resolveCards, titleOf } from "@core/config";
import { isUserFilled, type CoercedValue, type LabelMap, type OutputField } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { WrapRow } from "../components/WrapRow";
import { FieldRenderer } from "./FieldRenderer";

/** Fields the labeler answers per record — session answers live on the setup step. */
const isRecordField = (field: OutputField): boolean =>
  isUserFilled(field) && field.fill?.kind !== "session";

export function OutputForm(): React.JSX.Element | null {
  const config = useStore((s) => s.config);
  const index = useStore((s) => s.index);
  const record = useStore(selectCurrentRecord);
  const labels = useStore((s) => s.labels[s.index]);
  const setLabel = useStore((s) => s.setLabel);

  const fieldsByName = new Map<string, OutputField>(
    (config?.output.fields ?? []).map((f) => [f.name, f]),
  );
  const recordFields = (config?.output.fields ?? []).filter(isRecordField);
  const cards: Card[] = resolveCards(
    config?.output.cards?.filter((c) => c.scope !== "session"),
    recordFields.map((f) => f.name),
  );

  if (!config || !record || recordFields.length === 0) return null;
  const current: LabelMap = labels ?? record.labelValues;
  const onChange = (field: string, value: CoercedValue | null): void =>
    setLabel(index, field, value);

  return (
    <div className="glass shrink-0 border-t border-border">
      <div className="max-h-[28vh] w-full space-y-4 overflow-auto px-6 py-3">
        {cards.map((card) => (
          <div key={card.name} className="space-y-2">
            {card.display?.title && (
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {titleOf(card.name, card.display)}
              </h3>
            )}
            {card.rows.map((row, ri) => (
              <OutputRow
                key={ri}
                row={row}
                fieldsByName={fieldsByName}
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
  values,
  onChange,
}: {
  row: CardRow;
  fieldsByName: Map<string, OutputField>;
  values: LabelMap;
  onChange: (field: string, value: CoercedValue | null) => void;
}): React.JSX.Element | null {
  const fields = row.use
    .map((name) => fieldsByName.get(name))
    .filter((f): f is OutputField => f !== undefined && isRecordField(f));
  if (fields.length === 0) return null;

  const items = fields.map((field) => ({
    key: field.name,
    node: (
      <FieldRenderer
        field={field}
        value={values[field.name] ?? null}
        onChange={(value) => onChange(field.name, value)}
      />
    ),
  }));

  return (
    <WrapRow columns={row.perRow ?? fields.length} itemMinWidthClass="min-w-56" items={items} />
  );
}
