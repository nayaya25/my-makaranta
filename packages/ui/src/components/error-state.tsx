import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-12 px-6 text-center", className)}
      {...props}
    >
      <div className="bg-error/10 text-error rounded-pill p-3">
        <AlertTriangle size={24} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-h3 font-semibold text-ink-1000 dark:text-white">{title}</p>
        {description && (
          <p className="text-small text-ink-500">{description}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
