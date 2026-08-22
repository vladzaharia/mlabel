import type { Card, CardRow } from "@core/config";
import { resolveCards, titleOf } from "@core/config";
import {
  isRequired as isRequiredField,
  isUserFilled,
  type CoercedValue,
  type LabelMap,
  type OutputField,
} from "@core";
import { ChevronRight } from "lucide-react";
import { evaluateRecord, resolveLabelValues } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { Button } from "../components/ui/button";
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

  const prefill = useStore((s) => s.prefill);
  const next = useStore((s) => s.next);
  const total = useStore((s) => s.records.length);

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

  // Judged on the merged view the export will use, so the count can't disagree
  // with what actually lands in the output file.
  const evaluation = evaluateRecord(
    resolveLabelValues(current, prefill, config.output.fields),
    config.output.fields,
  );
  const missing =
    evaluation.status === "complete"
      ? 0
      : countMissing(evaluation, config.output.fields, current, prefill);
  const isLast = index >= total - 1;

  return (
    <div className="glass flex shrink-0 flex-col border-t border-border xl:w-[26rem] xl:border-l xl:border-t-0">
      <div className="max-h-[28vh] w-full flex-1 space-y-4 overflow-auto px-6 py-3 xl:max-h-none">
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

      {/*
        One Next, pinned so it never scrolls away, at the end of the eye path
        rather than diagonally across the window in the title bar. It reports
        what is still missing but never blocks — blocking forward motion is the
        fastest way to make people fill garbage into required fields.
      */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border/60 px-6 py-2.5">
        <span className="flex-1 text-xs text-muted-foreground">
          {evaluation.status === "complete"
            ? "Complete"
            : missing === 1
              ? "1 required field left"
              : `${String(missing)} required fields left`}
        </span>
        <kbd
          aria-hidden="true"
          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          ⏎
        </kbd>
        <Button size="sm" onClick={next} disabled={isLast} aria-label="Next record">
          Next
          <ChevronRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** How many required fields are still unanswered or invalid. */
function countMissing(
  evaluation: ReturnType<typeof evaluateRecord>,
  fields: readonly OutputField[],
  values: LabelMap,
  prefill: LabelMap,
): number {
  const merged = resolveLabelValues(values, prefill, fields);
  let n = 0;
  for (const field of fields) {
    if (!isRequiredField(field)) continue;
    const value = merged[field.name];
    const empty = value === undefined || value === null || value === "";
    if (empty || evaluation.errors.some((e) => e.field === field.name)) n += 1;
  }
  return n;
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
