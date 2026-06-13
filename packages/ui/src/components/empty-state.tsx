import { cn } from "../lib/cn";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4 py-12 px-6 text-center", className)}
      {...props}
    >
      {icon && (
        <div className="bg-ink-100 dark:bg-white/5 rounded-pill p-3 text-ink-500">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-h3 font-semibold text-ink-1000 dark:text-white">{title}</p>
        {description && (
          <p className="text-small text-ink-500">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
