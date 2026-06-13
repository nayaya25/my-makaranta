import { forwardRef } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../lib/cn";

export interface SwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {}

export const Switch = forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill",
      "bg-ink-300 dark:bg-white/15",
      "transition-colors duration-micro",
      "data-[state=checked]:bg-brand-500",
      "focus-visible:outline-none focus-visible:shadow-focus",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-pill bg-white shadow-sm",
        "transition-transform duration-micro",
        "translate-x-0.5 data-[state=checked]:translate-x-[1.375rem]",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
