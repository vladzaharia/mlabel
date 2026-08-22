import type { FC } from "react";
import type { OutputField, Widget } from "@core/config";
import { titleOf } from "@core/config";
import { isRequired, validateOutputValue, widgetOf, type CoercedValue } from "@core";
import { HelpBubble } from "../components/ui/popover";
import {
  CheckboxGroupWidget,
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

/** A widget as the registry stores it, before its field type is narrowed. */
type AnyWidget = FC<WidgetProps>;

/**
 * Keyed by the *resolved widget*, which `widgetOf` derives from the field's
 * type unless the author named one. `Record<Widget, …>` keeps this exhaustive:
 * add a widget to `WIDGETS_BY_TYPE` without a component here and the build fails.
 *
 * Individual widgets narrow their `field` prop to the types they handle
 * (`NumberWidget` reads `field.min`), which the schema guarantees by only
 * offering each type its legal widgets. TypeScript can't follow that through a
 * lookup, so the table is widened once here rather than at every call site.
 */
const REGISTRY = {
  text: TextWidget,
  textarea: TextareaWidget,
  number: NumberWidget,
  slider: SliderWidget,
  date: DateWidget,
  checkbox: CheckboxWidget,
  checkboxes: CheckboxGroupWidget,
  radio: RadioWidget,
  select: SelectWidget,
} as unknown as Record<Widget, AnyWidget>;

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
}): React.JSX.Element | null {
  const widgetName = widgetOf(field);
  if (widgetName === undefined) return null;
  const Widget = REGISTRY[widgetName];

  const error = isProvided(value) ? validateOutputValue(field, value as CoercedValue) : null;
  const required = isRequired(field);
  const display = field.display;

  const fieldId = `field-${field.name}`;
  const errorId = `${fieldId}-error`;
  const descId = `${fieldId}-desc`;
  const describedBy =
    [display?.description ? descId : "", error ? errorId : ""].filter(Boolean).join(" ") ||
    undefined;

  const caption = (
    <>
      {titleOf(field.name, display)}
      {required && <span className="ml-0.5 text-danger-text">*</span>}
    </>
  );

  const label = (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium">{caption}</span>
      {display?.help && <HelpBubble>{display.help}</HelpBubble>}
    </div>
  );
  const description = display?.description && (
    <p id={descId} className="text-xs text-muted-foreground">
      {display.description}
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

  // A checkbox reads more naturally as [control] label. The HelpBubble <button>
  // must sit OUTSIDE the <label> to avoid nested interactive content.
  if (field.type === "boolean") {
    return (
      <div id={fieldId} className="flex items-center gap-2.5">
        <label className="flex items-center gap-2.5">
          {widget}
          <span className="flex flex-col">
            <span className="text-sm font-medium">{caption}</span>
            {display?.description && (
              <span id={descId} className="text-xs text-muted-foreground">
                {display.description}
              </span>
            )}
            {errorEl}
          </span>
        </label>
        {display?.help && <HelpBubble>{display.help}</HelpBubble>}
      </div>
    );
  }

  if (display?.titlePosition === "left") {
    return (
      // The id is how a config-declared shortcut finds this field's widget —
      // simpler and more robust than a ref registry, which the React Compiler
      // would have to be kept honest about.
      <div id={fieldId} className="flex gap-4">
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
    <div id={fieldId} className="flex flex-col gap-1.5">
      {label}
      {description}
      {widget}
      {errorEl}
    </div>
  );
}
