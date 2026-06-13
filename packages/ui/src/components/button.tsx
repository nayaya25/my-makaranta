import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const button = cva(
  // base: smooth micro-motion, accessible focus ring, subtle press feedback
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button font-medium",
    "transition-[transform,background-color,box-shadow,color] duration-micro ease-expo",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand-500 text-white shadow-sm hover:bg-brand-700 hover:shadow-md",
        secondary: "bg-ink-100 text-ink-1000 hover:bg-ink-300/60",
        ghost: "bg-transparent text-ink-700 hover:bg-ink-100",
        destructive: "bg-error text-white shadow-sm hover:brightness-95 hover:shadow-md",
        outline: "border border-ink-300 bg-transparent text-ink-1000 hover:bg-ink-100",
      },
      size: {
        sm: "h-9 px-3 text-small",
        md: "h-11 px-4 text-body",
        lg: "h-12 px-6 text-body",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
