import type { FC } from "react";
import type { OutputControl, OutputField } from "@core/config";
import { validateOutputValue, type CoercedValue } from "@core";
import { HelpBubble } from "../components/ui/popover";
import {
  CheckboxWidget,
  DateWidget,
  NumberWidget,
  RadioWidget,
  SelectWidget,
  SliderWidget,
  TextWidget,
  TextareaWidget,
  type WidgetProps,
} from "./widgets";

const REGISTRY: Record<OutputControl, FC<WidgetProps>> = {
  text: TextWidget,
  textarea: TextareaWidget,
  number: NumberWidget,
  date: DateWidget,
  checkbox: CheckboxWidget,
  radio: RadioWidget,
  select: SelectWidget,
  slider: SliderWidget,
  hidden: () => null,
};

function isProvided(value: CoercedValue | null): boolean {
  return value !== null && value !== undefined && value !== "";
}

export function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: OutputField;
  value: CoercedValue | null;
  onChange: (value: CoercedValue | null) => void;
}): React.JSX.Element {
  const Widget = REGISTRY[field.control];
  const error = isProvided(value) ? validateOutputValue(field, value as CoercedValue) : null;

  const errorId = `field-${field.name}-error`;
  const descId = `field-${field.name}-desc`;
  const describedBy =
    [field.description ? descId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;

  const label = (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">
        {field.displayName ?? field.name}
        {field.required && <span className="ml-0.5 text-danger-text">*</span>}
      </span>
      {field.help && <HelpBubble>{field.help}</HelpBubble>}
    </div>
  );
  const description = field.description && (
    <p id={descId} className="text-xs text-muted-foreground">
      {field.description}
    </p>
  );
  const errorEl = error && (
    <p id={errorId} className="text-xs text-danger-text">
      {error}
    </p>
  );
  const widget = (
    <Widget
      field={field}
      value={value}
      onChange={onChange}
      invalid={Boolean(error)}
      describedBy={describedBy}
    />
  );

  // Checkbox reads more naturally as [control] label.
  // The HelpBubble <button> must sit OUTSIDE the <label> to avoid nested
  // interactive-content ambiguity per the HTML spec.
  if (field.control === "checkbox") {
    const labelText = (
      <span className="flex flex-col">
        <span className="text-sm font-medium">
          {field.displayName ?? field.name}
          {field.required && <span className="ml-0.5 text-danger-text">*</span>}
        </span>
        {field.description && (
          <span id={descId} className="text-xs text-muted-foreground">
            {field.description}
          </span>
        )}
        {errorEl}
      </span>
    );
    return (
      <div className="flex items-center gap-2.5">
        <label className="flex items-center gap-2.5">
          {widget}
          {labelText}
        </label>
        {field.help && <HelpBubble>{field.help}</HelpBubble>}
      </div>
    );
  }

  if (field.labelPosition === "left") {
    return (
      <div className="flex gap-4">
        <div className="w-40 shrink-0 pt-1.5">
          {label}
          {description}
        </div>
        <div className="min-w-0 flex-1">
          {widget}
          {errorEl}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {description}
      {widget}
      {errorEl}
    </div>
  );
}
