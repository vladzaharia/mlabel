import { HelpCircle } from "lucide-react";
import type { Category, InputField } from "@core/config";
import type { CoercedValue } from "@core";
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
    <section className="glass-card overflow-hidden rounded-xl border border-border shadow-sm">
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-sm font-semibold">{category.displayName}</h2>
        {category.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{category.description}</p>
        )}
      </div>

      {category.help && (
        <div className="flex items-start gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <HelpCircle size={13} className="mt-0.5 shrink-0" />
          <span>{category.help}</span>
        </div>
      )}

      <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
        {category.rows.map((row, i) => (
          <GridRow key={i} row={row} fieldsByName={fieldsByName} values={values} />
        ))}
      </div>
    </section>
  );
}
