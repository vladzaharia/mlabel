import type { InputField } from "@core/config";
import { titleOf } from "@core/config";
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
  const display = field.display;
  const label = (
    <div className="flex items-center gap-1">
      <span className="text-sm font-medium text-muted-foreground">
        {titleOf(field.name, display)}
      </span>
      {display?.help && <HelpBubble>{display.help}</HelpBubble>}
    </div>
  );
  const description = display?.description && (
    <p className="text-xs text-muted-foreground/80">{display.description}</p>
  );
  const valueEl = (
    <div className={cn(sizeClass[display?.textSize ?? "md"])}>
      {/* A field *is* its type, so it can be handed straight to the formatter. */}
      <ValueView type={field} value={value} />
    </div>
  );

  if (display?.titlePosition === "above") {
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
