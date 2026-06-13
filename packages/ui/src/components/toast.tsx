import * as RadixToast from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const toast = cva(
  [
    "relative flex flex-col gap-1 rounded-card bg-surface dark:bg-surface-dark shadow-lg p-4",
    "border-l-4 transition-all duration-standard ease-expo",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0",
    "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
  ],
  {
    variants: {
      tone: {
        neutral: "border-l-ink-300",
        success: "border-l-success",
        error: "border-l-error",
        info: "border-l-info",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface ToastProps
  extends React.ComponentPropsWithoutRef<typeof RadixToast.Root>,
    VariantProps<typeof toast> {
  title?: string;
  description?: string;
}

function ToastRoot({ className, tone, title, description, children, ...props }: ToastProps) {
  return (
    <RadixToast.Root className={cn(toast({ tone }), className)} {...props}>
      {title && (
        <RadixToast.Title className="text-small font-semibold text-ink-1000 dark:text-white pr-6">
          {title}
        </RadixToast.Title>
      )}
      {description && (
        <RadixToast.Description className="text-caption text-ink-500">
          {description}
        </RadixToast.Description>
      )}
      {children}
      <RadixToast.Close className="absolute top-3 right-3 text-ink-500 hover:text-ink-1000 dark:hover:text-white transition-colors duration-micro">
        <X size={14} />
      </RadixToast.Close>
    </RadixToast.Root>
  );
}

function ToastViewport({ className, ...props }: React.ComponentPropsWithoutRef<typeof RadixToast.Viewport>) {
  return (
    <RadixToast.Viewport
      className={cn(
        "fixed bottom-4 right-4 flex flex-col gap-2 w-[360px] max-w-[90vw] z-50",
        className,
      )}
      {...props}
    />
  );
}

export const Toast = {
  Provider: RadixToast.Provider,
  Viewport: ToastViewport,
  Root: ToastRoot,
};
