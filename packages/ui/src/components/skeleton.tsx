import { cn } from "../lib/cn";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-ink-100 dark:bg-white/10", className)}
      {...props}
    />
  );
}
Skeleton.displayName = "Skeleton";
