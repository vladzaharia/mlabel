import { partFileNames } from "@core";
import { cn } from "../lib/utils";

/**
 * Visualizes a split as discrete blocks: one per part file, width proportional
 * to its row count, labeled with the exact filename the split will write
 * (names come from core so preview and writer can never disagree).
 */
export function ChunkMap({
  sourcePath,
  sizes,
}: {
  sourcePath: string;
  sizes: readonly number[];
}): React.JSX.Element {
  const names = partFileNames(sourcePath, sizes.length);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return (
    <ul
      aria-label={`${String(sizes.length)} part files`}
      className="mt-3 flex list-none gap-1.5 p-0"
    >
      {sizes.map((size, index) => (
        <li
          key={index}
          style={{ flexGrow: size, flexBasis: `${String((size / total) * 100)}%` }}
          className={cn(
            "min-w-0 rounded-md border border-accent/40 px-1.5 py-1.5 text-center",
            index % 2 === 0 ? "bg-accent/20" : "bg-accent/10",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            Part {index + 1}
          </p>
          <p className="text-xs font-semibold tabular-nums">
            {size} row{size === 1 ? "" : "s"}
          </p>
          <p className="break-all text-[10px] leading-tight text-muted-foreground">
            {names[index]}
          </p>
        </li>
      ))}
    </ul>
  );
}
