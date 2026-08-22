import { ClipboardList } from "lucide-react";
import { resolveCards, titleOf, type Card, type CardRow } from "@core/config";
import {
  sessionAnswered,
  sessionFields,
  type CoercedValue,
  type LabelMap,
  type OutputField,
} from "@core";
import { useStore } from "../store/store";
import { useHeadingFocus } from "../a11y/useHeadingFocus";
import { Button } from "../components/ui/button";
import { WrapRow } from "../components/WrapRow";
import { FieldRenderer } from "../output/FieldRenderer";

/**
 * Questions asked once per file, before labeling starts — who is labeling,
 * which team, and so on. The answers are stamped onto every exported row.
 *
 * A step rather than a modal: a modal gets dismissed reflexively, and then you
 * either block the labeler or silently export rows with a blank annotator
 * column. This can't be skipped by accident, and it can't be left incomplete —
 * Continue stays disabled until every required answer is valid.
 */
export function PrefillScreen(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const prefill = useStore((s) => s.prefill);
  const setPrefill = useStore((s) => s.setPrefill);
  const startLabeling = useStore((s) => s.startLabeling);
  const headingRef = useHeadingFocus();

  const fields: OutputField[] = config ? sessionFields(config.output.fields) : [];
  const ready = config ? sessionAnswered(prefill, config.output.fields) : true;

  // Session-scoped cards give these fields a real layout; without any, they
  // fall back to one per row like every other implicit card.
  const cards: Card[] = resolveCards(
    config?.output.cards?.filter((c) => c.scope === "session"),
    fields.map((f) => f.name),
  );
  const byName = new Map(fields.map((f) => [f.name, f]));

  const onChange = (field: string, value: CoercedValue | null): void => setPrefill(field, value);

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-8">
      <div className="glass-card w-full max-w-xl space-y-6 rounded-xl p-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/12 text-accent">
            <ClipboardList size={22} aria-hidden="true" />
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            Before you begin
          </h1>
          <p className="text-sm text-muted-foreground">
            Recorded once and stamped on every row you label in this file.
          </p>
        </div>

        <div className="space-y-4">
          {cards.map((card) => (
            <div key={card.name} className="space-y-2">
              {card.display?.title && (
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {titleOf(card.name, card.display)}
                </h2>
              )}
              {card.rows.map((row, ri) => (
                <PrefillRow
                  key={ri}
                  row={row}
                  fieldsByName={byName}
                  values={prefill}
                  onChange={onChange}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button size="lg" disabled={!ready} onClick={startLabeling}>
            Start labeling
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One row of setup questions — same shape as a labeling row, different screen. */
function PrefillRow({
  row,
  fieldsByName,
  values,
  onChange,
}: {
  row: CardRow;
  fieldsByName: Map<string, OutputField>;
  values: LabelMap;
  onChange: (field: string, value: CoercedValue | null) => void;
}): React.JSX.Element {
  const items = row.use.flatMap((name) => {
    const field = fieldsByName.get(name);
    if (!field) return [];
    return [
      {
        key: name,
        node: (
          <FieldRenderer
            field={field}
            value={values[name] ?? null}
            onChange={(value) => onChange(name, value)}
          />
        ),
      },
    ];
  });
  return (
    <WrapRow columns={row.perRow ?? row.use.length} itemMinWidthClass="min-w-56" items={items} />
  );
}
