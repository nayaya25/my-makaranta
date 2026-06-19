import { cn } from "../lib/cn";
import { Card } from "./card";

const TONE: Record<string, string> = {
  default: "text-ink-1000 dark:text-ink-100",
  brand: "text-brand-700 dark:text-brand-300",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
}

/** Compact KPI tile — label, large tabular value, optional hint + icon. */
export function StatCard({ label, value, hint, icon, tone = "default", className }: StatCardProps) {
  return (
    <Card elevation="xs" className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-small font-medium text-ink-500">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
            {icon}
          </span>
        )}
      </div>
      <p className={cn("mt-3 font-display text-[1.75rem] font-bold leading-none tabular-nums", TONE[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-caption text-ink-500">{hint}</p>}
    </Card>
  );
}
