import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Label } from "./label";

export interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, required, hint, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {hint && !error && (
        <span className="text-caption text-ink-500">{hint}</span>
      )}
      {error && (
        <span role="alert" className="text-caption text-error">
          {error}
        </span>
      )}
    </div>
  );
}
