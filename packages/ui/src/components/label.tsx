import { forwardRef } from "react";
import { cn } from "../lib/cn";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-small font-medium text-ink-700 dark:text-ink-300", className)}
      {...props}
    >
      {children}
      {required && <span className="text-error"> *</span>}
    </label>
  ),
);
Label.displayName = "Label";
