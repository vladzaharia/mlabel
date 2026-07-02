import { Check, X } from "lucide-react";
import type { ObjectFieldShape, ValueTypeShape } from "@core/config";
import type { CoercedValue } from "@core";
import { Table, Td } from "./ValueTable";

const Empty = (): React.JSX.Element => <span className="text-muted-foreground/60">—</span>;

function isEmpty(value: CoercedValue | undefined): boolean {
  return value === null || value === undefined || value === "";
}

function fieldLabel(field: ObjectFieldShape): string {
  return field.displayName ?? field.name;
}

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
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "bool":
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

function BoolPill({ value }: { value: boolean }): React.JSX.Element {
  return (
    <span
      className={
        value
          ? "inline-flex items-center gap-1 text-progress"
          : "inline-flex items-center gap-1 text-muted-foreground"
      }
    >
      {value ? <Check size={14} /> : <X size={14} />}
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
  const option = type.options.find((o) => o.value === value);
  return (
    <span className="inline-flex items-center rounded-full bg-accent/12 px-2 py-0.5 text-xs font-medium text-accent">
      {option?.displayName ?? value}
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
    return <ObjectTable fields={type.items.fields} rows={rows} />;
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

  if (type.valueType.type === "object") {
    const fields = type.valueType.fields;
    const rows = entries.map(([key, data]) => ({
      key,
      data: data as Record<string, CoercedValue>,
    }));
    return <ObjectTable fields={fields} rows={rows} keyHeader="Key" />;
  }

  return (
    <Table head={["Key", "Value"]}>
      {entries.map(([key, val]) => (
        <tr key={key} className="border-t border-border/60">
          <Td className="font-medium">{key}</Td>
          <Td>
            <ValueView type={type.valueType} value={val} />
          </Td>
        </tr>
      ))}
    </Table>
  );
}

function ObjectView({
  fields,
  value,
}: {
  fields: ObjectFieldShape[];
  value: Record<string, CoercedValue>;
}): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {fields.map((field) => (
        <div key={field.name} className="contents">
          <dt className="text-muted-foreground">{fieldLabel(field)}</dt>
          <dd>
            <ValueView type={field.type} value={value?.[field.name]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Shared table renderer for array<object> and (with a key column) map<object>. */
function ObjectTable({
  fields,
  rows,
  keyHeader,
}: {
  fields: ObjectFieldShape[];
  rows: { key?: string; data: Record<string, CoercedValue> }[];
  keyHeader?: string;
}): React.JSX.Element {
  const head = keyHeader ? [keyHeader, ...fields.map(fieldLabel)] : fields.map(fieldLabel);
  return (
    <Table head={head}>
      {rows.map((row, i) => (
        <tr key={row.key ?? i} className="border-t border-border/60">
          {keyHeader !== undefined && <Td className="font-semibold">{row.key}</Td>}
          {fields.map((field) => (
            <Td key={field.name}>
              <ValueView type={field.type} value={row.data[field.name]} />
            </Td>
          ))}
        </tr>
      ))}
    </Table>
  );
}
