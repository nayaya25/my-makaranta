import { forwardRef } from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[88px] w-full rounded-input border bg-surface px-3.5 py-2.5 text-body text-ink-1000 transition-shadow duration-micro ease-expo",
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
Textarea.displayName = "Textarea";
