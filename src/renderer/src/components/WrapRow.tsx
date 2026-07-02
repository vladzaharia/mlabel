import type { ReactNode } from "react";

/**
 * A row of items that flows with flex-wrap; `columns` sets each item's
 * flex-basis so the row keeps at least that many columns when wide and wraps
 * to fewer on narrow widths ("minimum columns"). The 1.5rem subtracted from
 * the basis matches this container's `gap-x-6`.
 */
export function WrapRow({
  columns,
  itemMinWidthClass,
  items,
}: {
  columns: number;
  itemMinWidthClass: string;
  items: readonly { key: string; node: ReactNode }[];
}): React.JSX.Element {
  const basis = `calc(${(100 / columns).toFixed(4)}% - 1.5rem)`;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {items.map(({ key, node }) => (
        <div key={key} className={itemMinWidthClass} style={{ flexBasis: basis, flexGrow: 1 }}>
          {node}
        </div>
      ))}
    </div>
  );
}
