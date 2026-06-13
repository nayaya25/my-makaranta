import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badge = cva(
  "inline-flex items-center rounded-pill px-2.5 py-1 text-caption font-semibold",
  {
    variants: {
      tone: {
        neutral: "bg-ink-100 text-ink-700 dark:bg-white/10 dark:text-ink-300",
        brand: "bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300",
        success: "bg-success/15 text-success",
        warning: "bg-warning/15 text-warning",
        error: "bg-error/15 text-error",
        info: "bg-info/15 text-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badge({ tone }), className)} {...props} />
  ),
);
Badge.displayName = "Badge";
