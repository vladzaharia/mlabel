import { Switch as S } from "radix-ui";
import { cn } from "../../lib/utils";

/**
 * An on/off switch.
 *
 * The disabled state is drawn with a muted fill and a border rather than
 * `opacity`: on this app's translucent surfaces a faded control shows the
 * wallpaper through it and reads as a rendering failure rather than as
 * something deliberately unavailable.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name. The visible text beside it is the caller's business. */
  label: string;
}): React.JSX.Element {
  return (
    <S.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled
          ? "cursor-not-allowed border-border bg-muted/40"
          : checked
            ? "border-accent bg-accent"
            : "border-border bg-muted",
      )}
    >
      <S.Thumb
        className={cn(
          "block size-3.5 rounded-full bg-background shadow-sm transition-transform",
          "translate-x-0.5 data-[state=checked]:translate-x-[18px]",
        )}
      />
    </S.Root>
  );
}
