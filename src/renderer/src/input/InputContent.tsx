import { useStore, selectCurrentRecord } from "../store/store";

/** Placeholder input content — replaced by category cards in Phase 5. */
export function InputContent(): React.JSX.Element {
  const record = useStore(selectCurrentRecord);
  const config = useStore((s) => s.config);

  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="glass-card mx-auto max-w-3xl rounded-xl border border-border p-4">
        <p className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
          {config?.categories.length ?? 0} categories
        </p>
        <pre className="overflow-auto text-xs">{JSON.stringify(record?.inputValues, null, 2)}</pre>
      </div>
    </div>
  );
}
