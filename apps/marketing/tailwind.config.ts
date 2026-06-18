import type { Config } from "tailwindcss";
import { preset } from "@mymakaranta/ui/tailwind-preset";

// Marketing-only overrides: a light, editorial "classy" system (Triumphpforte-inspired)
// — warm cream canvas, deep forest-teal accent, near-black serif headlines, warm grey
// body. Scoped here so the app (apps/web) is untouched until any Phase-2 cascade.
export default {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Fraunces", "Newsreader", "Georgia", "serif"],
        sans: ["General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        cream: { DEFAULT: "#F0ECE6", deep: "#E9E5DF", dark: "#E3DDD3" },
        forest: { DEFAULT: "#465F5C", dark: "#33403E", soft: "#5E7B77" },
        bark: "#1A1A1A", // headings / near-black
        stone: "#6B6B64", // warm-grey body text
      },
    },
  },
} satisfies Config;
