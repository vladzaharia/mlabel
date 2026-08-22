import type { InputField } from "@core/config";
import { resolveCards } from "@core/config";
import { useStore, selectCurrentRecord } from "../store/store";
import { CategoryCard } from "./CategoryCard";

export function InputContent(): React.JSX.Element {
  const config = useStore((s) => s.config);
  const record = useStore(selectCurrentRecord);

  const fieldsByName = new Map<string, InputField>(
    (config?.input.fields ?? []).map((field) => [field.name, field]),
  );

  if (!config || !record) return <div className="flex-1" />;

  const cards = resolveCards(
    config.input.cards,
    config.input.fields.map((f) => f.name),
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-5">
        {cards.map((card) => (
          <CategoryCard
            key={card.name}
            card={card}
            fieldsByName={fieldsByName}
            values={record.inputValues}
          />
        ))}
      </div>
    </div>
  );
}
