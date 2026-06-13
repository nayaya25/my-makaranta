import { forwardRef } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(
  ({ className, children, onRemove, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill bg-ink-100 px-2.5 py-1 text-caption font-medium text-ink-700 dark:bg-white/10 dark:text-ink-300",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-ink-300/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-700"
        >
          <X size={12} />
        </button>
      )}
    </span>
  ),
);
Tag.displayName = "Tag";
