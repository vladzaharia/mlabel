import { Check, X } from "lucide-react";
import type { NestedFieldShape, ValueTypeShape } from "@core/config";
import { DEFAULT_COLUMN_LAYOUT, titleOf } from "@core/config";
import {
  hasModelDecoration,
  hasTimeOfDay,
  notesOf,
  toneOf,
  type CoercedValue,
  type Decoration,
} from "@core";
import { SEVERITY } from "../components/Severity";
import { cn } from "../lib/utils";
import { Table, Td, type TableHead } from "./ValueTable";

const Empty = (): React.JSX.Element => <span className="text-muted-foreground/60">—</span>;

function isEmpty(value: CoercedValue | undefined): boolean {
  return value === null || value === undefined || value === "";
}

const fieldLabel = (field: NestedFieldShape): string => titleOf(field.name, field.display);

/** Recursively render a coerced input value read-only, per its declared type. */
export function ValueView({
  type,
  value,
  itemDecorations,
}: {
  type: ValueTypeShape;
  value: CoercedValue | undefined;
  /**
   * Per-element decorations from a `forEach` rule, index-aligned with `value`.
   *
   * Consumed only by the array branch, and deliberately not forwarded to the
   * recursive calls below: a `forEach` rule names a top-level field, so a nested
   * list is out of scope by construction rather than by accident.
   */
  itemDecorations?: readonly (readonly Decoration[])[];
}): React.JSX.Element {
  if (isEmpty(value)) return <Empty />;

  switch (type.type) {
    case "text":
      return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
    case "integer":
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "boolean":
      return <BoolPill value={Boolean(value)} />;
    case "date":
      return <span className="tabular-nums">{formatDate(value)}</span>;
    case "enum":
      return <EnumPill type={type} value={String(value)} />;
    case "array":
      return (
        <ArrayView type={type} value={value as CoercedValue[]} itemDecorations={itemDecorations} />
      );
    case "map":
      return <MapView type={type} value={value as Record<string, CoercedValue>} />;
    case "object":
      return <ObjectView fields={type.fields} value={value as Record<string, CoercedValue>} />;
  }
}

/**
 * Render a date the way the source wrote it.
 *
 * Formatted in UTC, to match how `parseDateish` reads it. Local formatting would
 * undo that: a date-only value is anchored to UTC midnight, so west of Greenwich
 * `toLocaleDateString()` renders the *previous* day — the source says 1 May and
 * the labeler reads 30 April. The time of day appears only when the value
 * actually carries one; see `hasTimeOfDay` for how that is known.
 */
function formatDate(value: CoercedValue | undefined): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = { timeZone: "UTC" };
  return hasTimeOfDay(date)
    ? date.toLocaleString(undefined, options)
    : date.toLocaleDateString(undefined, options);
}

function BoolPill({ value, label }: { value: boolean; label?: string }): React.JSX.Element {
  return (
    <span
      className={
        value
          ? "inline-flex items-center gap-1 text-progress-text"
          : "inline-flex items-center gap-1 text-muted-foreground"
      }
    >
      {value ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
      {label === undefined ? (
        <span className="sr-only">{value ? "true" : "false"}</span>
      ) : (
        <span className="text-xs">{label}</span>
      )}
    </span>
  );
}

function EnumPill({
  type,
  value,
}: {
  type: Extract<ValueTypeShape, { type: "enum" }>;
  value: string;
}): React.JSX.Element {
  const choice = type.choices.find((c) => c.name === value);
  return (
    <span className="inline-flex items-center rounded-full bg-accent/12 px-2 py-0.5 text-xs font-medium text-accent">
      {titleOf(value, choice?.display)}
    </span>
  );
}

function ArrayView({
  type,
  value,
  itemDecorations,
}: {
  type: Extract<ValueTypeShape, { type: "array" }>;
  value: CoercedValue[];
  itemDecorations?: readonly (readonly Decoration[])[];
}): React.JSX.Element {
  if (!Array.isArray(value) || value.length === 0) return <Empty />;
  if (type.items.type === "object") {
    const rows = value.map((item, i) => ({
      data: item as Record<string, CoercedValue>,
      decorations: itemDecorations?.[i],
    }));
    return <ObjectTable objectType={type.items} rows={rows} />;
  }
  // A list of scalars — ten comma-joined addresses in one CSV cell, typically —
  // carries its decorations on the chips themselves. There is no row to tint
  // and no spare column for a note, so the tone does the pointing and the note
  // rides in `title` and an `sr-only` line: the same sentence printed under ten
  // chips would drown the values it is about.
  // An unflagged entry gets no frame at all. Every entry used to sit in a
  // filled chip, which made a list of ten read as ten highlights and left the
  // four that meant something indistinguishable from the rest. Framing is what
  // a rule adds; without one an entry is just a value in a list.
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {value.map((item, i) => {
        const decorations = itemDecorations?.[i];
        const tone = toneOf(decorations);
        const notes = notesOf(decorations);
        const fromModel = hasModelDecoration(decorations);
        return (
          <span
            key={i}
            data-item=""
            {...(notes.length > 0 ? { title: notes.join(" ") } : {})}
            className={cn(
              "text-xs",
              tone
                ? cn(
                    "rounded-md border px-2 py-0.5",
                    SEVERITY[tone].borderClass,
                    SEVERITY[tone].textClass,
                  )
                : "text-muted-foreground",
              // A guess gets a dashed edge, as everywhere else it appears.
              fromModel && "border-dashed",
            )}
          >
            <ValueView type={type.items} value={item} />
            {notes.length > 0 && (
              <span className="sr-only">
                {fromModel && "Suggested by the local model: "}
                {notes.join(" ")}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function MapView({
  type,
  value,
}: {
  type: Extract<ValueTypeShape, { type: "map" }>;
  value: Record<string, CoercedValue>;
}): React.JSX.Element {
  const entries = Object.entries(value ?? {});
  if (entries.length === 0) return <Empty />;

  if (type.values.type === "object") {
    const rows = entries.map(([key, data]) => ({
      key,
      data: data as Record<string, CoercedValue>,
    }));
    return <ObjectTable objectType={type.values} rows={rows} keyHeader="Key" />;
  }

  return (
    <Table
      label="Key/value pairs"
      head={[
        { id: "key", label: "Key" },
        { id: "value", label: "Value" },
      ]}
    >
      {entries.map(([key, val]) => (
        <tr key={key} className="border-t border-border/60">
          <Td className="font-medium">{key}</Td>
          <Td>
            <ValueView type={type.values} value={val} />
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function ObjectView({
  fields,
  value,
  compact,
}: {
  fields: NestedFieldShape[];
  value: Record<string, CoercedValue>;
  compact?: boolean;
}): React.JSX.Element {
  return (
    <dl
      className={
        compact
          ? "grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs"
          : "grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"
      }
    >
      {fields.map((field) => (
        <div key={field.name} className="contents">
          <dt className="text-muted-foreground">{fieldLabel(field)}</dt>
          <dd>
            <ValueView type={field} value={value?.[field.name]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

type ObjectType = Extract<ValueTypeShape, { type: "object" }>;

interface ResolvedColumn {
  head: TableHead;
  render: (data: Record<string, CoercedValue>) => React.ReactNode;
}

/**
 * Turn an object type into displayed table columns.
 *
 * Without a `table` block that is one column per field. With one, several
 * fields can share a cell — four booleans read far better as `✓ Tox  ✗ PII`
 * than as four columns of bare glyphs whose meaning lives in a distant header.
 */
function resolveColumns(objectType: ObjectType): ResolvedColumn[] {
  const byName = new Map(objectType.fields.map((f) => [f.name, f]));

  if (!objectType.table) {
    return objectType.fields.map((field) => ({
      head: { id: field.name, label: fieldLabel(field) },
      render: (data) => <ValueView type={field} value={data[field.name]} />,
    }));
  }

  return objectType.table.columns.map((column) => {
    const picked = column.use.flatMap((name) => {
      const field = byName.get(name);
      return field ? [field] : [];
    });
    const layout = column.layout ?? DEFAULT_COLUMN_LAYOUT;
    return {
      head: { id: column.name, label: titleOf(column.name, column.display) },
      render: (data) => <CompositeCell fields={picked} data={data} layout={layout} />,
    };
  });
}

function CompositeCell({
  fields,
  data,
  layout,
}: {
  fields: NestedFieldShape[];
  data: Record<string, CoercedValue>;
  layout: "chips" | "stack" | "inline";
}): React.JSX.Element {
  // A stacked cell is just an object rendered label-over-value, so it reuses
  // ObjectView rather than introducing a second way to draw the same thing.
  if (layout === "stack") return <ObjectView fields={fields} value={data} compact />;

  // A one-field column is already captioned by its own header, so repeating the
  // field label in every cell just reads as part of the value ("Check safety").
  // Booleans are the exception below — a bare tick names nothing.
  const labelled = fields.length > 1;

  return (
    <div className={layout === "chips" ? "flex flex-wrap gap-1.5" : "flex flex-wrap gap-3"}>
      {fields.map((field) => {
        const value = data[field.name];
        const label = fieldLabel(field);
        // Booleans carry their own label so a tick never floats unattached.
        if (field.type === "boolean") {
          return (
            <span
              key={field.name}
              className={layout === "chips" ? "rounded-md bg-muted px-1.5 py-0.5" : undefined}
            >
              <BoolPill value={Boolean(value)} label={label} />
            </span>
          );
        }
        return (
          <span
            key={field.name}
            className={
              layout === "chips"
                ? "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
                : "inline-flex items-center gap-1 text-xs"
            }
          >
            {labelled && <span className="text-muted-foreground">{label}</span>}
            <ValueView type={field} value={value} />
          </span>
        );
      })}
    </div>
  );
}

/** Shared table renderer for array<object> and (with a key column) map<object>. */
function ObjectTable({
  objectType,
  rows,
  keyHeader,
}: {
  objectType: ObjectType;
  rows: {
    key?: string;
    data: Record<string, CoercedValue>;
    decorations?: readonly Decoration[];
  }[];
  keyHeader?: string;
}): React.JSX.Element {
  const columns = resolveColumns(objectType);
  const head: TableHead[] =
    keyHeader === undefined
      ? columns.map((c) => c.head)
      : [{ id: "__key", label: keyHeader }, ...columns.map((c) => c.head)];

  return (
    <Table
      label={keyHeader === undefined ? "Table of values" : "Table of keyed values"}
      head={head}
    >
      {rows.map((row, i) => {
        const tone = toneOf(row.decorations);
        const notes = notesOf(row.decorations);
        return (
          <tr
            key={row.key ?? i}
            className={cn("border-t border-border/60", tone && SEVERITY[tone].frameClass)}
          >
            {keyHeader !== undefined && <Td className="font-semibold">{row.key}</Td>}
            {columns.map((column, ci) => (
              <Td key={column.head.id}>
                {column.render(row.data)}
                {/* The note rides in the first cell rather than a trailing one:
                    an extra cell would break the column count, and in-row text
                    is read in row order by a screen reader. */}
                {ci === 0 && notes.length > 0 && (
                  <p className={cn("mt-0.5 text-xs", tone && SEVERITY[tone].textClass)}>
                    {notes.join(" ")}
                  </p>
                )}
              </Td>
            ))}
          </tr>
        );
      })}
    </Table>
  );
}
