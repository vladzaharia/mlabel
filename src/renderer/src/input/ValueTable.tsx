import { cn } from "../lib/utils";

/** Table chrome shared by the composite value renderers (map / array<object>). */

export interface TableHead {
  /** Stable React key. Two columns may legitimately share a caption. */
  id: string;
  label: string;
}

export function Table({
  head,
  label,
  children,
}: {
  head: TableHead[];
  /** Names the scroll region for keyboard and screen-reader users. */
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    // Three things have to agree for a wide table to scroll rather than shred:
    //   `overflow-x-auto` makes the overflow reachable at all;
    //   `w-max min-w-full` lets columns size to their content instead of being
    //     squeezed to fit (break-words will otherwise collapse text to ~1 char
    //     per line and the table never overflows in the first place);
    //   the per-cell max-width below stops one long value from running forever.
    // `overflow-y-hidden` is explicit because it would otherwise compute to
    // `auto` and produce a phantom vertical scrollbar.
    <section
      aria-label={label}
      // A scrollable region must be reachable by keyboard alone (WCAG 2.1.1),
      // which is exactly what a tabIndex on a non-interactive element is for.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="overflow-x-auto overflow-y-hidden rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            {head.map((column) => (
              <th
                key={column.id}
                className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

export function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <td className={cn("px-2.5 py-1.5 align-top", className)}>
      {/* max-width on a <td> is only a hint to the auto table algorithm; an
          inner block element honours it strictly. */}
      <div className="max-w-[32ch]">{children}</div>
    </td>
  );
}
