import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

const Overlay = ({ className, ...props }: RadixDialog.DialogOverlayProps) => (
  <RadixDialog.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-ink-1000/40 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "duration-standard ease-expo",
      className,
    )}
    {...props}
  />
);

const Content = ({
  className,
  children,
  ...props
}: RadixDialog.DialogContentProps) => (
  <RadixDialog.Portal>
    <Overlay />
    <RadixDialog.Content
      className={cn(
        "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        "w-full max-w-lg p-6",
        "bg-surface dark:bg-surface-dark rounded-card shadow-xl border border-ink-100 dark:border-white/10",
        "text-ink-1000 dark:text-ink-100",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        "duration-standard ease-expo",
        className,
      )}
      {...props}
    >
      {children}
      <RadixDialog.Close
        aria-label="Close"
        className={cn(
          "absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100",
          "focus-visible:outline-none focus-visible:shadow-focus",
          "transition-opacity duration-micro ease-expo",
        )}
      >
        <X className="h-4 w-4" />
      </RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
);

const Header = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 mb-4", className)} {...props} />
);

const Title = ({ className, ...props }: RadixDialog.DialogTitleProps) => (
  <RadixDialog.Title
    className={cn("text-h3 font-semibold text-ink-1000 dark:text-ink-100", className)}
    {...props}
  />
);

const Description = ({ className, ...props }: RadixDialog.DialogDescriptionProps) => (
  <RadixDialog.Description
    className={cn("text-small text-ink-500", className)}
    {...props}
  />
);

const Footer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center justify-end gap-3 mt-6", className)} {...props} />
);

const Close = RadixDialog.Close;

export const Dialog = {
  Root: RadixDialog.Root,
  Trigger: RadixDialog.Trigger,
  Content,
  Header,
  Title,
  Description,
  Footer,
  Close,
};
