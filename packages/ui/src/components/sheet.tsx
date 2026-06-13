import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

const sideStyles = {
  right: "inset-y-0 right-0 h-full w-[min(90vw,420px)] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
  left: "inset-y-0 left-0 h-full w-[min(90vw,420px)] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  bottom: "inset-x-0 bottom-0 w-full rounded-t-sheet border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
} as const;

type Side = keyof typeof sideStyles;

interface SheetContentProps extends RadixDialog.DialogContentProps {
  side?: Side;
}

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

const Content = ({ side = "right", className, children, ...props }: SheetContentProps) => (
  <RadixDialog.Portal>
    <Overlay />
    <RadixDialog.Content
      className={cn(
        "fixed z-50 flex flex-col",
        "bg-surface dark:bg-surface-dark shadow-xl border border-ink-100 dark:border-white/10",
        "text-ink-1000 dark:text-ink-100",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "duration-standard ease-expo",
        sideStyles[side],
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
  <div className={cn("flex flex-col gap-1.5 p-6 pb-0", className)} {...props} />
);

const Title = ({ className, ...props }: RadixDialog.DialogTitleProps) => (
  <RadixDialog.Title
    className={cn("text-h3 font-semibold text-ink-1000 dark:text-ink-100", className)}
    {...props}
  />
);

const Footer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center gap-3 p-6 pt-0 mt-auto", className)} {...props} />
);

const Close = RadixDialog.Close;

export const Sheet = {
  Root: RadixDialog.Root,
  Trigger: RadixDialog.Trigger,
  Content,
  Header,
  Title,
  Footer,
  Close,
};
