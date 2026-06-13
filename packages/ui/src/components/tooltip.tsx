import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/cn";

const Content = ({
  className,
  sideOffset = 6,
  ...props
}: RadixTooltip.TooltipContentProps) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      sideOffset={sideOffset}
      className={cn(
        "z-50 px-2 py-1",
        "bg-ink-1000 text-white text-caption rounded-sm shadow-md",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
        "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
        "duration-micro ease-expo",
        className,
      )}
      {...props}
    />
  </RadixTooltip.Portal>
);

export const Tooltip = {
  Provider: RadixTooltip.Provider,
  Root: RadixTooltip.Root,
  Trigger: RadixTooltip.Trigger,
  Content,
};
