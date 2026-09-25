import { Sparkles } from "lucide-react";
import type { Card } from "@core/config";
import { toneOf, type Decoration, type Decorations } from "@core";
import { SEVERITY, type SeverityKind } from "../components/Severity";
import { cn } from "../lib/utils";

/**
 * What the rules and the model had to say about one card, gathered in a footer.
 *
 * Two problems with saying it anywhere else. A note about a group — "handle and
 * address share a local part" — attached to one of the two fields it is about
 * reads as a fact about that field alone. And a per-item rule that matched four
 * entries of ten states itself four times in the list without ever saying
 * *four*, which is the number a reviewer is actually weighing.
 *
 * Always rendered, including when it has nothing. In a tool where the absence
 * of a warning has to be trusted, "nothing found" is a different message from
 * an empty space, and only one of them is checkable.
 */

/** One line of the footer. */
interface Line {
  key: string;
  text: string;
  tone: SeverityKind | undefined;
  fromModel: boolean;
  /** `4 of 10`, for a rule that matched some entries of a list. */
  count?: string;
}

/**
 * Collapse a list's per-item decorations into one line per distinct note.
 *
 * The denominator is the point: four of ten neighbours sharing a domain is a
 * different observation from ten of ten, and the list alone makes a reader
 * count.
 */
function itemLines(name: string, rows: readonly (readonly Decoration[])[]): Line[] {
  const byNote = new Map<
    string,
    { count: number; tone: SeverityKind | undefined; model: boolean }
  >();
  for (const decorations of rows) {
    for (const decoration of decorations) {
      const note = decoration.style.note;
      if (note === undefined) continue;
      const existing = byNote.get(note);
      if (existing) existing.count += 1;
      else {
        byNote.set(note, {
          count: 1,
          tone: decoration.style.tone,
          model: decoration.source === "model",
        });
      }
    }
  }
  return [...byNote].map(([note, { count, tone, model }]) => ({
    key: `${name}:${note}`,
    text: note,
    tone,
    fromModel: model,
    count: `${String(count)} of ${String(rows.length)}`,
  }));
}

export function CardAnalysis({
  card,
  decorations,
}: {
  card: Card;
  decorations: Decorations;
}): React.JSX.Element {
  const own = decorations.cards.get(card.name) ?? [];
  const cardTone = toneOf(own);

  const lines: Line[] = own
    .filter((decoration) => decoration.style.note !== undefined)
    .map((decoration, i) => ({
      key: `card:${decoration.rule}:${String(i)}`,
      text: decoration.style.note as string,
      tone: decoration.style.tone ?? cardTone,
      fromModel: decoration.source === "model",
    }));

  // Only the fields this card actually shows: a per-item rule on a list living
  // in another card is that card's business.
  for (const name of card.rows.flatMap((row) => row.use)) {
    const rows = decorations.items.get(name);
    if (rows) lines.push(...itemLines(name, rows));
  }

  return (
    <div className="border-t border-border/60 px-4 py-3">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles size={11} aria-hidden="true" />
        Analysis
      </h4>
      {lines.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">No anomalies detected.</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {lines.map((line) => (
            <li
              key={line.key}
              className={cn(
                "flex items-start gap-1.5 text-xs",
                // A guess yields its colour, as it does everywhere else: an
                // authored rule is a statement, a finding is a suggestion.
                line.fromModel
                  ? "text-muted-foreground"
                  : line.tone
                    ? SEVERITY[line.tone].textClass
                    : "text-muted-foreground",
              )}
            >
              <span aria-hidden="true" className="mt-px shrink-0">
                ·
              </span>
              <span>
                {line.fromModel && <span className="sr-only">Suggested by the local model: </span>}
                {line.text}
                {line.count !== undefined && (
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({line.count})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
