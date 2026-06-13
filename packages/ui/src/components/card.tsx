import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const card = cva("rounded-card bg-white transition-shadow duration-standard ease-expo", {
  variants: {
    elevation: {
      flat: "border border-ink-100",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
    },
    interactive: { true: "hover:shadow-lg cursor-pointer", false: "" },
  },
  defaultVariants: { elevation: "sm", interactive: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof card> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevation, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(card({ elevation, interactive }), className)} {...props} />
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
