import { useStore } from "../store/store";

/** Placeholder output form — replaced by the RHF field registry in Phase 6. */
export function OutputForm(): React.JSX.Element | null {
  const config = useStore((s) => s.config);
  const visibleFields = config?.output.fields.filter((f) => f.control !== "hidden") ?? [];
  if (visibleFields.length === 0) return null;

  return (
    <div className="glass shrink-0 border-t border-border p-4">
      <div className="mx-auto max-w-3xl">
        <p className="text-muted-foreground text-xs">
          {visibleFields.length} output fields (Phase 6)
        </p>
      </div>
    </div>
  );
}
