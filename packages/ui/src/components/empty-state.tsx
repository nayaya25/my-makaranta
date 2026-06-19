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
      className={cn("flex flex-col items-center justify-center gap-5 px-6 py-16 text-center", className)}
      {...props}
    >
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
          {icon}
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-h3 font-semibold text-ink-1000 dark:text-white">{title}</p>
        {description && <p className="text-small leading-relaxed text-ink-500">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
