import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const card = cva("transition-shadow duration-standard ease-expo", {
  variants: {
    tone: {
      // Bold Ink base — bordered crisp card (admin/proprietor surfaces)
      base: "rounded-card border border-ink-100 bg-surface dark:border-white/10 dark:bg-surface-dark",
      // Saffron warmth — friendlier radius, borderless, softer (parent/student surfaces)
      warm: "rounded-warm bg-surface dark:bg-surface-dark",
    },
    elevation: {
      flat: "",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
    },
    interactive: { true: "hover:shadow-lg cursor-pointer", false: "" },
  },
  defaultVariants: { tone: "base", elevation: "sm", interactive: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, tone, elevation, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(card({ tone, elevation, interactive }), className)} {...props} />
  ),
);
Card.displayName = "Card";

export const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />
);

export const CardBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-5", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center gap-3 p-5 pt-0", className)} {...props} />
);
