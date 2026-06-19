import { cn } from "../lib/cn";

/** Consistent page frame: centered max-width + responsive padding. */
export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10", className)} {...props} />;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

/** Standard page header: optional eyebrow, title, description, and a right-aligned actions slot. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-caption font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</p>
        )}
        <h1 className="font-display text-h2 font-bold tracking-tight text-ink-1000 dark:text-ink-100">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-small leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
