import type { InputField } from "@core/config";
import type { CoercedValue } from "@core";
import { HelpBubble } from "../components/ui/popover";
import { cn } from "../lib/utils";
import { ValueView } from "./ValueView";

const sizeClass = { sm: "text-xs", md: "text-sm", lg: "text-base" } as const;

export function InputFieldView({
  field,
  value,
}: {
  field: InputField;
  value: CoercedValue | undefined;
}): React.JSX.Element {
  const label = (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium text-muted-foreground">
        {field.displayName ?? field.name}
      </span>
      {field.help && <HelpBubble>{field.help}</HelpBubble>}
    </div>
  );
  const description = field.description && (
    <p className="text-xs text-muted-foreground/80">{field.description}</p>
  );
  const valueEl = (
    <div className={cn(sizeClass[field.textSize])}>
      <ValueView type={field.type} value={value} />
    </div>
  );

  if (field.labelPosition === "above") {
    return (
      <div className="flex flex-col gap-1">
        {label}
        {valueEl}
        {description}
      </div>
    );
  }
  return (
    <div className="flex gap-4">
      <div className="w-40 shrink-0 pt-0.5">
        {label}
        {description}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">{valueEl}</div>
    </div>
  );
}
