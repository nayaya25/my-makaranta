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

const Content = ({ className, children, ...props }: RadixDialog.DialogContentProps) => (
  <RadixDialog.Portal>
    <Overlay />
    <RadixDialog.Content
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col",
        "h-full w-[min(85vw,300px)] border-r",
        "bg-surface dark:bg-surface-dark shadow-xl border-ink-100 dark:border-white/10",
        "text-ink-1000 dark:text-ink-100",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
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

const Close = RadixDialog.Close;

export const Drawer = {
  Root: RadixDialog.Root,
  Trigger: RadixDialog.Trigger,
  Content,
  Close,
};
