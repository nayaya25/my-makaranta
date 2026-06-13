import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import { cn } from "../lib/cn";

function Content({ className, sideOffset = 6, ...props }: React.ComponentPropsWithoutRef<typeof RadixDropdown.Content>) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[180px] rounded-card bg-surface dark:bg-surface-dark shadow-lg p-1.5",
          "border border-ink-100 dark:border-white/10",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </RadixDropdown.Portal>
  );
}

function Item({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixDropdown.Item>) {
  return (
    <RadixDropdown.Item
      className={cn(
        "flex items-center gap-2 rounded-sm px-2.5 py-2 text-small text-ink-1000 dark:text-white",
        "cursor-pointer outline-none select-none",
        "data-[highlighted]:bg-ink-100 dark:data-[highlighted]:bg-white/10",
        "data-[disabled]:opacity-50 data-[disabled]:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

function Separator({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixDropdown.Separator>) {
  return (
    <RadixDropdown.Separator
      className={cn("my-1 h-px bg-ink-100 dark:bg-white/10", className)}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixDropdown.Label>) {
  return (
    <RadixDropdown.Label
      className={cn("px-2.5 py-1.5 text-caption font-semibold text-ink-500 uppercase tracking-wide", className)}
      {...props}
    />
  );
}

export const Dropdown = {
  Root: RadixDropdown.Root,
  Trigger: RadixDropdown.Trigger,
  Content,
  Item,
  Separator,
  Label,
};
