import type { InputField } from "@core/config";
import { titleOf } from "@core/config";
import { notesOf, toneOf, type CoercedValue, type Decoration } from "@core";
import { Callout } from "../components/Callout";
import { SEVERITY } from "../components/Severity";
import { HelpBubble } from "../components/ui/popover";
import { cn } from "../lib/utils";
import { ValueView } from "./ValueView";

const sizeClass = { sm: "text-xs", md: "text-sm", lg: "text-base" } as const;

export function InputFieldView({
  field,
  value,
  decorations,
  coercionError,
}: {
  field: InputField;
  value: CoercedValue | undefined;
  /** What the config's display rules say about this field, if anything. */
  decorations?: readonly Decoration[];
  /** Set when the source cell failed to parse into the declared type. */
  coercionError?: string;
}): React.JSX.Element {
  const display = field.display;
  const tone = toneOf(decorations);
  const notes = notesOf(decorations);

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
    <div
      className={cn(
        sizeClass[display?.textSize ?? "md"],
        // A rule annotates read-only source data the labeler cannot change, so
        // it gets a left rail and a tint — never the full red border that means
        // "you must fix this", which would send them hunting for a fix.
        tone && SEVERITY[tone].frameClass,
        tone && SEVERITY[tone].textClass,
      )}
    >
      {/* A field *is* its type, so it can be handed straight to the formatter. */}
      <ValueView type={field} value={value} />
    </div>
  );

  // A cell that failed to parse renders as an em-dash exactly like an empty one,
  // so without this a labeler judges a record off silently broken data.
  const problems = coercionError !== undefined && (
    <Callout tone="warning" className="mt-1">
      Could not read this value: {coercionError}
    </Callout>
  );
  const explanation = notes.length > 0 && (
    <p className={cn("mt-1 text-xs", tone ? SEVERITY[tone].textClass : "text-muted-foreground")}>
      {notes.join(" ")}
    </p>
  );

  if (display?.titlePosition === "above") {
    return (
      <div className="flex flex-col gap-1">
        {label}
        {valueEl}
        {explanation}
        {problems}
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
      <div className="min-w-0 flex-1 pt-0.5">
        {valueEl}
        {explanation}
        {problems}
      </div>
    </div>
  );
}
