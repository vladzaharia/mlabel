import { Check, ChevronDown } from "lucide-react";
import { Checkbox, RadioGroup, Select, Slider } from "radix-ui";
import type { OutputField, ValueTypeKind } from "@core/config";
import { titleOf } from "@core/config";
import { isRequired } from "@core";
import type { CoercedValue } from "@core";
import { cn } from "../lib/utils";

/**
 * Props for one widget.
 *
 * Generic over the type kinds a widget handles, so a number widget can read
 * `field.min` without a cast — the discriminated union narrows it. The registry
 * in FieldRenderer picks the widget *from* the type, so the pairing is already
 * guaranteed by the time these render.
 */
export interface WidgetProps<K extends ValueTypeKind = ValueTypeKind> {
  field: Extract<OutputField, { type: K }>;
  value: CoercedValue | null;
  onChange: (value: CoercedValue | null) => void;
  invalid?: boolean;
  describedBy?: string;
}

const fieldBase =
  "w-full rounded-md border bg-background/40 px-3 py-1.5 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring";

function borderClass(invalid?: boolean): string {
  return invalid ? "border-danger" : "border-border";
}

function ariaLabel(field: OutputField): string {
  return titleOf(field.name, field.display);
}

export function TextWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps): React.JSX.Element {
  return (
    <input
      type="text"
      aria-label={ariaLabel(field)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={isRequired(field) || undefined}
      className={cn(fieldBase, borderClass(invalid))}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    />
  );
}

export function TextareaWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps): React.JSX.Element {
  return (
    <textarea
      rows={3}
      aria-label={ariaLabel(field)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={isRequired(field) || undefined}
      className={cn(fieldBase, borderClass(invalid), "resize-y")}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    />
  );
}

export function NumberWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps<"number" | "integer">): React.JSX.Element {
  return (
    <input
      type="number"
      aria-label={ariaLabel(field)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={isRequired(field) || undefined}
      className={cn(fieldBase, borderClass(invalid), "tabular-nums")}
      value={typeof value === "number" ? value : ""}
      min={field.min}
      max={field.max}
      step={field.step}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
    />
  );
}

export function DateWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps): React.JSX.Element {
  const asInput =
    value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : "";
  return (
    <input
      type="date"
      aria-label={ariaLabel(field)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={isRequired(field) || undefined}
      className={cn(fieldBase, borderClass(invalid), "tabular-nums")}
      value={asInput}
      onChange={(e) =>
        onChange(e.target.value === "" ? null : new Date(`${e.target.value}T00:00:00`))
      }
    />
  );
}

export function CheckboxWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps): React.JSX.Element {
  // Intentionally no aria-label: FieldRenderer wraps this in a <label> element that names the control.
  return (
    <Checkbox.Root
      checked={value === true}
      onCheckedChange={(checked) => onChange(checked === true)}
      required={isRequired(field) || undefined}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded border bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        invalid ? "border-danger" : "border-border",
      )}
    >
      <Checkbox.Indicator>
        <Check size={14} className="text-accent-foreground" />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

export function RadioWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps<"enum">): React.JSX.Element {
  return (
    <RadioGroup.Root
      aria-label={ariaLabel(field)}
      required={isRequired(field) || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={cn(
        "flex flex-wrap gap-2 rounded-md p-0.5",
        invalid && "outline outline-2 outline-danger",
      )}
      value={typeof value === "string" ? value : ""}
      onValueChange={(v) => onChange(v)}
    >
      {field.choices.map((option) => (
        <RadioGroup.Item
          key={option.name}
          value={option.name}
          className="group flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-accent data-[state=checked]:bg-accent/10"
        >
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-foreground group-data-[state=checked]:border-accent">
            <RadioGroup.Indicator className="h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          {titleOf(option.name, option.display)}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export function SelectWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps<"enum">): React.JSX.Element {
  return (
    <Select.Root
      value={typeof value === "string" ? value : undefined}
      onValueChange={(v) => onChange(v)}
    >
      <Select.Trigger
        aria-label={ariaLabel(field)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={isRequired(field) || undefined}
        className={cn(fieldBase, borderClass(invalid), "flex items-center justify-between gap-2")}
      >
        <Select.Value placeholder="Select…" />
        <Select.Icon>
          <ChevronDown size={15} className="text-muted-foreground" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="glass-popover z-50 overflow-hidden rounded-md border border-border shadow-lg">
          <Select.Viewport className="p-1">
            {field.choices.map((option) => (
              <Select.Item
                key={option.name}
                value={option.name}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent/15"
              >
                <Select.ItemText>{titleOf(option.name, option.display)}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={14} className="text-accent" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function SliderWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps<"number" | "integer">): React.JSX.Element {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const current = typeof value === "number" ? value : min;
  return (
    <div className="flex items-center gap-3">
      <Slider.Root
        className="relative flex h-5 flex-1 touch-none items-center"
        value={[current]}
        min={min}
        max={max}
        step={field.step ?? 1}
        onValueChange={([v]) => onChange(v ?? min)}
      >
        <Slider.Track
          className={cn("relative h-1.5 grow rounded-full", invalid ? "bg-danger/30" : "bg-muted")}
        >
          <Slider.Range
            className={cn("absolute h-full rounded-full", invalid ? "bg-danger" : "bg-accent")}
          />
        </Slider.Track>
        <Slider.Thumb
          aria-label={ariaLabel(field)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required={isRequired(field) || undefined}
          className="relative block h-5 w-5 rounded-full border-2 border-accent bg-background shadow before:absolute before:-inset-1 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Slider.Root>
      <span
        aria-hidden="true"
        className="w-10 text-right text-sm tabular-nums text-muted-foreground"
      >
        {current}
      </span>
    </div>
  );
}

/**
 * Multi-select over an `array` of `enum` — the second-most-common labeling
 * output after a single choice. The value is the list of selected choice names,
 * which the CSV sink already round-trips as JSON.
 */
export function CheckboxGroupWidget({
  field,
  value,
  onChange,
  invalid,
  describedBy,
}: WidgetProps<"array">): React.JSX.Element {
  const items = field.items.type === "enum" ? field.items.choices : [];
  const selected = new Set(Array.isArray(value) ? value.map(String) : []);

  function toggle(name: string, checked: boolean): void {
    const next = new Set(selected);
    if (checked) next.add(name);
    else next.delete(name);
    // Keep declaration order so the exported cell is stable regardless of the
    // order the labeler happened to click in.
    const ordered = items.map((c) => c.name).filter((n) => next.has(n));
    onChange(ordered.length === 0 ? null : ordered);
  }

  return (
    // <fieldset> is the native grouping element; `role="group"` would not accept
    // aria-invalid anyway, so validity is conveyed per-checkbox instead.
    <fieldset aria-describedby={describedBy} className="flex flex-wrap gap-x-4 gap-y-2">
      <legend className="sr-only">{ariaLabel(field)}</legend>
      {items.map((choice) => (
        <label key={choice.name} className="flex items-center gap-2 text-sm">
          <Checkbox.Root
            checked={selected.has(choice.name)}
            onCheckedChange={(state) => toggle(choice.name, state === true)}
            className={cn(
              "flex size-4 items-center justify-center rounded border transition-colors",
              borderClass(invalid),
              selected.has(choice.name) && "border-accent bg-accent text-accent-foreground",
            )}
          >
            <Checkbox.Indicator>
              <Check size={12} aria-hidden="true" />
            </Checkbox.Indicator>
          </Checkbox.Root>
          {titleOf(choice.name, choice.display)}
        </label>
      ))}
    </fieldset>
  );
}
