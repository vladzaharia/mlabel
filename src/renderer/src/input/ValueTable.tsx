/** Table chrome shared by the composite value renderers (map / array<object>). */

export function Table({
  head,
  children,
}: {
  head: string[];
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            {head.map((h) => (
              <th key={h} className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return <td className={`px-2.5 py-1.5 align-top ${className ?? ""}`}>{children}</td>;
}
