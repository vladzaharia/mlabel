import { Toaster as Sonner } from "sonner";

/** App-wide toast host. Styled to match the translucent theme. */
export function Toaster(): React.JSX.Element {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "glass-popover !rounded-lg !border-border !text-popover-foreground !shadow-lg",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}

export { toast } from "sonner";
