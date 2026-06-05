import { useMemo } from "react";
import { isAutoCopied, type LabelMap, type OutputField } from "@core";
import { useStore, selectCurrentRecord } from "../store/store";
import { OutputCategoryCard, type OutputCategory } from "./OutputCategoryCard";

export function OutputForm(): React.JSX.Element | null {
  const config = useStore((s) => s.config);
  const index = useStore((s) => s.index);
  const record = useStore(selectCurrentRecord);
  const labels = useStore((s) => s.labels[s.index]);
  const setLabel = useStore((s) => s.setLabel);

  const { fieldsByName, inputNames, categories } = useMemo(() => {
    const byName = new Map<string, OutputField>(
      (config?.output.fields ?? []).map((f) => [f.name, f]),
    );
    const names = new Set(config?.input.fields.map((f) => f.name));
    const cats: OutputCategory[] =
      config?.output.categories ?? implicitCategories(config?.output.fields ?? [], names);
    return { fieldsByName: byName, inputNames: names, categories: cats };
  }, [config]);

  if (!config || !record || !hasVisibleField(config.output.fields, inputNames)) return null;
  const current: LabelMap = labels ?? record.labelValues;

  return (
    <div className="glass shrink-0 border-t border-border">
      <div className="flex max-h-[32vh] w-full flex-col gap-4 overflow-auto px-6 py-4">
        {categories.map((category, i) => (
          <OutputCategoryCard
            key={i}
            category={category}
            fieldsByName={fieldsByName}
            values={current}
            inputNames={inputNames}
            onChange={(field, value) => setLabel(index, field, value)}
          />
        ))}
      </div>
    </div>
  );
}

function hasVisibleField(fields: readonly OutputField[], inputNames: ReadonlySet<string>): boolean {
  return fields.some((f) => !isAutoCopied(f, inputNames));
}

/** When no output.categories are configured, show every visible field one per row. */
function implicitCategories(
  fields: readonly OutputField[],
  inputNames: ReadonlySet<string>,
): OutputCategory[] {
  const visible = fields.filter((f) => !isAutoCopied(f, inputNames));
  if (visible.length === 0) return [];
  return [{ rows: visible.map((f) => ({ fields: [f.name] })) }];
}
