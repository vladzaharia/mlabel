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
  /** How strongly a model line leans, 0 to 1. Absent on authored rules. */
  confidence?: number;
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
      ...(decoration.confidence === undefined ? {} : { confidence: decoration.confidence }),
    }));

  // Only the fields this card actually shows: a per-item rule on a list living
  // in another card is that card's business.
  for (const name of card.rows.flatMap((row) => row.use)) {
    const rows = decorations.items.get(name);
    if (rows) lines.push(...itemLines(name, rows));
  }

  const ruleLines = lines.filter((line) => !line.fromModel);
  // Strongest first. A column sorted by nothing makes a reviewer read all of it
  // to find the one worth acting on; sorted, the top line is that one.
  const modelLines = lines
    .filter((line) => line.fromModel)
    .toSorted((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  return (
    <div className="border-t border-border/60 px-4 py-3">
      {/*
        Two columns, because the two kinds of statement are not comparable and
        a single list invites reading them as one. A rule fired because someone
        who knows this data wrote down what it means; a suggestion is a guess
        from a small model that is wrong a fair fraction of the time. Mixed in
        one column, sorted by nothing in particular, the only thing separating
        them is a shade of grey — and this is a tool whose output becomes
        somebody's ground truth.

        Both sides are always rendered, including when empty. Where the absence
        of a warning has to be trusted, "nothing found" and a blank space are
        different messages and only one of them is checkable.
      */}
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Column empty="No rules fired." lines={ruleLines} title="Rules" />
        <Column empty="Nothing flagged." icon lines={modelLines} title="Model" />
      </div>
    </div>
  );
}

/**
 * How sure the model is, as a quantity rather than a hue.
 *
 * Three colour bands over a continuous value were doing all the work and doing
 * it badly: 74% came out grey and 75% blue, so a percentage point looked like a
 * difference while the gap from 75% to 95% looked like none. The number is
 * right-aligned and tabular so a column of them can be compared down the page,
 * and the bar gives the same value a length, which is read without parsing
 * digits at all. The colour stays, but it is now the least of three signals
 * rather than the only one.
 */
function Strength({
  value,
  tone,
}: {
  value: number;
  tone: SeverityKind | undefined;
}): React.JSX.Element {
  const pct = Math.round(value * 100);
  return (
    <span className="mt-px flex shrink-0 items-center gap-1.5" title={`${String(pct)}% confident`}>
      <span className={cn("w-7 text-right tabular-nums", tone ? SEVERITY[tone].textClass : "")}>
        {pct}%
      </span>
      <span aria-hidden="true" className="h-1 w-8 overflow-hidden rounded-full bg-border/70">
        <span
          className={cn(
            "block h-full rounded-full",
            tone ? SEVERITY[tone].dotClass : "bg-muted-foreground",
          )}
          style={{ width: `${String(pct)}%` }}
        />
      </span>
    </span>
  );
}

function Column({
  title,
  lines,
  empty,
  icon = false,
}: {
  title: string;
  lines: readonly Line[];
  empty: string;
  /** The model column is marked, so the two are told apart without reading. */
  icon?: boolean;
}): React.JSX.Element {
  return (
    <section>
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon && <Sparkles size={11} aria-hidden="true" />}
        {title}
      </h4>
      {lines.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {lines.map((line) => (
            <li
              key={line.key}
              className={cn(
                "flex items-start gap-1.5 text-xs",
                // Both columns colour by tone now. A guess used to be flattened
                // to grey here so it could not be mistaken for a rule, but the
                // two live in separate columns under separate headings, and that
                // separation says it better than a shade did — while leaving the
                // colour free to say how strong the answer is, which is the only
                // thing distinguishing seven model notes from one another.
                line.tone ? SEVERITY[line.tone].textClass : "text-muted-foreground",
              )}
            >
              {line.confidence === undefined ? (
                <span aria-hidden="true" className="mt-px shrink-0">
                  ·
                </span>
              ) : (
                <Strength tone={line.tone} value={line.confidence} />
              )}
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
    </section>
  );
}
