import * as RadixAccordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";

function Root({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixAccordion.Root>) {
  return (
    <RadixAccordion.Root
      className={cn("divide-y divide-ink-100 dark:divide-white/10", className)}
      {...props}
    />
  );
}

function Item({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixAccordion.Item>) {
  return <RadixAccordion.Item className={cn("", className)} {...props} />;
}

function Trigger({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof RadixAccordion.Trigger>) {
  return (
    <RadixAccordion.Header className="flex">
      <RadixAccordion.Trigger
        className={cn(
          "flex w-full items-center justify-between py-3 text-body font-medium text-ink-1000 dark:text-white",
          "transition-colors duration-micro ease-expo hover:text-ink-700 dark:hover:text-ink-300",
          "focus-visible:outline-none focus-visible:shadow-focus rounded-sm",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          size={16}
          className="shrink-0 text-ink-500 transition-transform duration-micro ease-expo data-[state=open]:rotate-180"
        />
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
}

function Content({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof RadixAccordion.Content>) {
  return (
    <RadixAccordion.Content
      className={cn(
        "overflow-hidden text-small text-ink-700 dark:text-ink-300",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    >
      <div className="pb-3">{children}</div>
    </RadixAccordion.Content>
  );
}

export const Accordion = {
  Root,
  Item,
  Trigger,
  Content,
};
