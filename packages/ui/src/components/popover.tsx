import * as RadixPopover from "@radix-ui/react-popover";
import { cn } from "../lib/cn";

const Content = ({
  className,
  sideOffset = 8,
  ...props
}: RadixPopover.PopoverContentProps) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 p-4",
        "bg-surface dark:bg-surface-dark rounded-card shadow-lg border border-ink-100 dark:border-white/10",
        "text-ink-1000 dark:text-ink-100",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        "data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
        "duration-standard ease-expo",
        className,
      )}
      {...props}
    />
  </RadixPopover.Portal>
);

export const Popover = {
  Root: RadixPopover.Root,
  Trigger: RadixPopover.Trigger,
  Content,
  Close: RadixPopover.Close,
  Anchor: RadixPopover.Anchor,
};
