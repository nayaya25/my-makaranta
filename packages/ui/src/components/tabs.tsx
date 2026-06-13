import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../lib/cn";

const TabsRoot = TabsPrimitive.Root;

const TabsList = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn(
      "flex gap-1 border-b border-ink-200",
      className,
    )}
    {...props}
  />
);
TabsList.displayName = "TabsList";

const TabsTrigger = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "px-3 py-2 text-body text-ink-500",
      "border-b-2 border-transparent -mb-px",
      "transition-colors duration-micro",
      "data-[state=active]:text-ink-1000 data-[state=active]:border-brand-500",
      "dark:text-ink-300 dark:data-[state=active]:text-ink-100",
      "focus-visible:outline-none focus-visible:shadow-focus",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
);
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content
    className={cn("mt-4 focus-visible:outline-none", className)}
    {...props}
  />
);
TabsContent.displayName = "TabsContent";

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
};
