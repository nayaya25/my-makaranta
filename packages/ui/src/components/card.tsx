import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const card = cva("transition-all duration-standard ease-expo", {
  variants: {
    tone: {
      // Crisp hairline-bordered surface (admin/proprietor) — Linear/Vercel-style.
      base: "rounded-[14px] border border-ink-1000/[0.08] bg-surface dark:border-white/10 dark:bg-surface-dark",
      // Friendlier radius, softer (parent/student surfaces).
      warm: "rounded-warm border border-ink-1000/[0.06] bg-surface dark:border-white/10 dark:bg-surface-dark",
    },
    elevation: {
      flat: "",
      xs: "shadow-xs",
      sm: "shadow-sm",
      md: "shadow-md",
      lg: "shadow-lg",
    },
    interactive: {
      true: "cursor-pointer hover:border-ink-1000/[0.14] hover:shadow-md dark:hover:border-white/20",
      false: "",
    },
  },
  defaultVariants: { tone: "base", elevation: "xs", interactive: false },
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
