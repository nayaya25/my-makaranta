import { ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items, className, ...props }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("", className)} {...props}>
      <ol className="flex items-center gap-1 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {isLast ? (
                <span
                  aria-current="page"
                  className="text-small font-medium text-ink-1000 dark:text-white"
                >
                  {item.label}
                </span>
              ) : (
                <>
                  <a
                    href={item.href ?? "#"}
                    className="text-small text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 transition-colors duration-micro"
                  >
                    {item.label}
                  </a>
                  <ChevronRight size={14} className="text-ink-300 shrink-0" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
