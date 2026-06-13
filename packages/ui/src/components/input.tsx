import { forwardRef } from "react";
import { cn } from "../lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-input border bg-surface px-3.5 text-body text-ink-1000 transition-shadow duration-micro ease-expo",
        "placeholder:text-ink-500 focus-visible:outline-none focus-visible:shadow-focus",
        "disabled:opacity-50 disabled:pointer-events-none",
        "dark:bg-surface-dark dark:text-ink-100",
        invalid
          ? "border-error"
          : "border-ink-300 dark:border-white/15",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
