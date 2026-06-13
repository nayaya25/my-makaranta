import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../lib/cn";

const SelectRoot = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>) => (
  <SelectPrimitive.Trigger
    className={cn(
      "flex h-11 w-full items-center justify-between rounded-input border border-ink-300",
      "bg-surface px-3.5 text-body text-ink-1000",
      "dark:bg-surface-dark dark:border-white/15 dark:text-ink-100",
      "transition-shadow duration-micro",
      "placeholder:text-ink-500",
      "focus-visible:outline-none focus-visible:shadow-focus",
      "disabled:pointer-events-none disabled:opacity-50",
      "[&[data-placeholder]>span]:text-ink-500",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 text-ink-500 shrink-0" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = ({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      position={position}
      className={cn(
        "relative z-50 min-w-[8rem] overflow-hidden rounded-card border border-ink-100",
        "bg-surface shadow-lg dark:bg-surface-dark dark:border-white/10",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        position === "popper" && "mt-1 w-[var(--radix-select-trigger-width)]",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);
SelectContent.displayName = "SelectContent";

const SelectItem = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) => (
  <SelectPrimitive.Item
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2",
      "text-body text-ink-700 dark:text-ink-300",
      "transition-colors duration-micro",
      "hover:bg-ink-100 dark:hover:bg-white/8",
      "focus:bg-ink-100 dark:focus:bg-white/8 focus:outline-none",
      "data-[state=checked]:text-ink-1000 dark:data-[state=checked]:text-ink-100",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
      <Check className="h-4 w-4 text-brand-500" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);
SelectItem.displayName = "SelectItem";

export const Select = {
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Content: SelectContent,
  Item: SelectItem,
};
