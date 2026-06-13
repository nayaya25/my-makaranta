import * as RadixAvatar from "@radix-ui/react-avatar";
import { cva } from "class-variance-authority";
import { cn } from "../lib/cn";

const avatarRoot = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300",
  {
    variants: {
      size: {
        sm: "h-8 w-8 text-caption",
        md: "h-10 w-10 text-small",
        lg: "h-12 w-12 text-body",
      },
    },
    defaultVariants: { size: "md" },
  },
);

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

export interface AvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Avatar({ src, name, size = "md", className }: AvatarProps) {
  return (
    <RadixAvatar.Root className={cn(avatarRoot({ size }), className)}>
      <RadixAvatar.Image
        src={src}
        alt={name}
        className="h-full w-full object-cover"
      />
      <RadixAvatar.Fallback delayMs={0} className="flex h-full w-full items-center justify-center font-semibold">
        {getInitials(name)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
Avatar.displayName = "Avatar";
