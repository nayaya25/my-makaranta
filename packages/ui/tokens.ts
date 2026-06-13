/**
 * Design tokens — single source of truth for myMakaranta's visual language.
 * Base direction: "Bold Ink" (Linear-leaning) — punchy electric indigo, crisp radii,
 * cool canvas, confident elevation. A "Saffron Warmth" layer (warm cream surface +
 * saffron accents + friendlier radius) is applied to the parent/student surfaces.
 * Tailwind consumes this via tailwind-preset.ts; components reference tokens through
 * Tailwind classes, never raw hex.
 */

export const colors = {
  brand: {
    50: "#EEF0FE",
    100: "#DADEFB",
    300: "#8B92F0",
    500: "#4338CA", // primary — electric indigo
    700: "#2E2A9E", // pressed / dark-mode primary
    900: "#181A4E",
  },
  saffron: {
    100: "#FEF3D9",
    500: "#E8A33C", // achievement / celebration / parent-surface accent
    700: "#A06A1A",
  },
  ink: {
    1000: "#0B0D12", // primary text on light; base canvas (dark)
    700: "#3C4150",
    500: "#6B7180",
    300: "#D9DCE3", // borders
    100: "#EEF0F4", // subtle fills
  },
  // Surfaces
  paper: "#F4F5F7", // cool app canvas (admin base)
  paperWarm: "#FBF7EF", // warm cream canvas (parent/student)
  paperDark: "#0B0D12", // base canvas (dark) — near-black, not pure
  surface: "#FFFFFF", // card surface (light)
  surfaceDark: "#15171F", // card surface (dark)
  // Semantic
  success: "#1F9D55",
  warning: "#D97706",
  error: "#E11D48", // punchy rose — overdue / absent / destructive
  info: "#2D7CE0",
  white: "#FFFFFF",
} as const;

export const fonts = {
  sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
  display: ["General Sans", "Inter", "sans-serif"],
  serif: ["Newsreader", "Georgia", "serif"],
} as const;

/** Modular scale (1.25). [fontSize, lineHeight]. */
export const fontSize = {
  display: ["4rem", "1.05"], // 64
  h1: ["2.5rem", "1.1"], // 40
  h2: ["1.75rem", "1.15"], // 28
  h3: ["1.25rem", "1.3"], // 20
  body: ["1rem", "1.5"], // 16
  small: ["0.875rem", "1.45"], // 14
  caption: ["0.75rem", "1.35"], // 12
} as const;

/** 4px base spacing scale. */
export const spacing = {
  0: "0",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
  16: "4rem",
  20: "5rem",
  24: "6rem",
} as const;

/** Crisp radii (Bold Ink). `warm` is the friendlier radius for parent/student cards. */
export const radius = {
  none: "0",
  sm: "0.375rem", // 6
  input: "0.5rem", // 8
  button: "0.5rem", // 8
  card: "0.75rem", // 12
  warm: "1rem", // 16 — parent/student cards
  sheet: "1.25rem", // 20
  pill: "9999px",
} as const;

/** Elevation — confident but layered (not harsh). Tuned on cool ink shadows. */
export const shadow = {
  none: "none",
  xs: "0 1px 2px 0 rgb(11 13 18 / 0.06)",
  sm: "0 1px 3px 0 rgb(11 13 18 / 0.08), 0 1px 2px -1px rgb(11 13 18 / 0.06)",
  md: "0 4px 14px -3px rgb(11 13 18 / 0.10), 0 2px 6px -3px rgb(11 13 18 / 0.06)",
  lg: "0 8px 24px -8px rgb(11 13 18 / 0.12), 0 6px 12px -8px rgb(11 13 18 / 0.08)",
  xl: "0 24px 48px -12px rgb(11 13 18 / 0.18), 0 12px 24px -12px rgb(11 13 18 / 0.10)",
  focus: "0 0 0 2px #F4F5F7, 0 0 0 4px #4338CA", // 2px ring + 2px offset
} as const;

/** Motion — custom ease-out-expo; linear forbidden except indeterminate progress. */
export const motion = {
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  duration: {
    micro: "120ms",
    standard: "240ms",
    hero: "560ms",
  },
} as const;

export const tokens = { colors, fonts, fontSize, spacing, radius, shadow, motion } as const;
export type Tokens = typeof tokens;
