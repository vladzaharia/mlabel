import { useEffect, useRef } from "react";
import type { InputField } from "@core/config";
import { resolveCards } from "@core/config";
import { evaluateDecorations } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { CategoryCard } from "./CategoryCard";

export function InputContent(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const record = useStore(selectCurrentRecord);
  const index = useStore((s) => s.index);
  const scroller = useRef<HTMLDivElement | null>(null);

  // Arriving mid-document on every Next costs an orienting scroll and a moment
  // of "where am I" — hundreds of times over a file.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [index]);

  const fieldsByName = new Map<string, InputField>(
    (config?.input.fields ?? []).map((field) => [field.name, field]),
  );

  if (!config || !record) return <div className="flex-1" />;

  const cards = resolveCards(
    config.input.cards,
    config.input.fields.map((f) => f.name),
  );

  // Evaluated per rendered record rather than for the whole file: only one
  // record is on screen, and rules read the values it actually holds.
  const decorations = evaluateDecorations(config.input.rules, record.inputValues);
  // Already computed in main and sent over IPC — it just never had a consumer,
  // so a cell that failed to parse looked exactly like an empty one.
  const coercionErrors = new Map(record.coercionErrors.map((e) => [e.field, e.message]));

  return (
    <div ref={scroller} className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-5">
        {cards.map((card) => (
          <CategoryCard
            key={card.name}
            card={card}
            fieldsByName={fieldsByName}
            values={record.inputValues}
            decorations={decorations}
            coercionErrors={coercionErrors}
          />
        ))}
      </div>
    </div>
  );
}
