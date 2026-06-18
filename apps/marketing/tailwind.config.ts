import type { Config } from "tailwindcss";
import { preset } from "@mymakaranta/ui/tailwind-preset";

// Marketing-only overrides: a clean, professional SaaS system inspired by Lattice's
// colour blend — white + warm sand neutrals, a confident deep-teal brand, a lime pop,
// and soft pastel card tints that frame product UI. Single geometric sans (General Sans,
// the closest free match to Lattice's Matter). Scoped here; apps/web is untouched.
export default {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#001F1F", // primary text — teal-black
        graphite: "#455252", // secondary text
        slate: "#6A7878", // tertiary text
        mist: "#C4CCCC", // borders / hairlines
        sand: { DEFAULT: "#FAF9F7", 100: "#F7F6F2", 200: "#EBE7E1" },
        teal: {
          50: "#DEF6F3",
          100: "#B1F0E7",
          200: "#51E0CD",
          400: "#00A3A3",
          600: "#007A7A",
          800: "#066666",
          1000: "#003D3D",
        },
        lime: { 50: "#F8FBE7", 100: "#EFF5CE", 200: "#DBEB7A", 400: "#B3CC18", 800: "#7B8F00" },
        mint: { 50: "#E6F9EE", 100: "#C4F5DB", 400: "#33B88C", 800: "#046645" },
        lilac: { 50: "#F0F0FF", 100: "#E1E1FA", 400: "#7070FF", 800: "#4533B8" },
        blush: { 50: "#FCF2FE", 100: "#FDE5FF", 400: "#E063C7", 800: "#B8337A" },
        sun: { 50: "#FFFAE6", 100: "#FFF3C2", 400: "#FFC247", 800: "#CC8418" },
      },
      borderRadius: {
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        "4xl": "2.25rem",
      },
    },
  },
} satisfies Config;
