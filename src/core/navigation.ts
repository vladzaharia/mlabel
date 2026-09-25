/**
 * Moving through a file by what still needs doing.
 *
 * Pure and index-only: the caller decides what "complete" means, which keeps
 * the label-merging rules in one place rather than duplicated here.
 */

/**
 * The nearest record still needing work, scanning outward from `from`.
 *
 * Starts at the neighbour, so pressing "next unfinished" while standing on an
 * unfinished record actually moves. Does not wrap: reaching the end of the file
 * is information, and silently continuing from the other end would lose it.
 *
 * `null` when there is none in that direction.
 */
export function findIncomplete(
  from: number,
  direction: 1 | -1,
  count: number,
  isComplete: (index: number) => boolean,
): number | null {
  for (let i = from + direction; i >= 0 && i < count; i += direction) {
    if (!isComplete(i)) return i;
  }
  return null;
}
