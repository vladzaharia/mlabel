import { Check, X } from "lucide-react";
import type { NestedFieldShape, ValueTypeShape } from "@core/config";
import { DEFAULT_COLUMN_LAYOUT, titleOf } from "@core/config";
import type { CoercedValue } from "@core";
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
}: {
  type: ValueTypeShape;
  value: CoercedValue | undefined;
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
      return <ArrayView type={type} value={value as CoercedValue[]} />;
    case "map":
      return <MapView type={type} value={value as Record<string, CoercedValue>} />;
    case "object":
      return <ObjectView fields={type.fields} value={value as Record<string, CoercedValue>} />;
  }
}

function formatDate(value: CoercedValue | undefined): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
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
}: {
  type: Extract<ValueTypeShape, { type: "array" }>;
  value: CoercedValue[];
}): React.JSX.Element {
  if (!Array.isArray(value) || value.length === 0) return <Empty />;
  if (type.items.type === "object") {
    const rows = value.map((item) => ({ data: item as Record<string, CoercedValue> }));
    return <ObjectTable objectType={type.items} rows={rows} />;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {value.map((item, i) => (
        <span key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs">
          <ValueView type={type.items} value={item} />
        </span>
      ))}
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
  rows: { key?: string; data: Record<string, CoercedValue> }[];
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
      {rows.map((row, i) => (
        <tr key={row.key ?? i} className="border-t border-border/60">
          {keyHeader !== undefined && <Td className="font-semibold">{row.key}</Td>}
          {columns.map((column) => (
            <Td key={column.head.id}>{column.render(row.data)}</Td>
          ))}
        </tr>
      ))}
    </Table>
  );
}
