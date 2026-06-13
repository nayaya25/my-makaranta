import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Compose class names with conflict-aware Tailwind merging. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
