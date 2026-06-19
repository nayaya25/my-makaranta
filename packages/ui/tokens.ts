/**
 * Design tokens — single source of truth for myMakaranta's visual language.
 * Direction: a clean, professional SaaS system (Lattice-inspired) — confident
 * deep teal as the brand (`brand`), a fresh lime as the accent/celebration layer
 * (`saffron`, kept under its old key so consumers don't break), teal-black ink,
 * warm sand canvas. Tailwind consumes this via tailwind-preset.ts; components
 * reference tokens through Tailwind classes, never raw hex.
 */

export const colors = {
  brand: {
    50: "#DEF6F3",
    100: "#B1F0E7",
    300: "#51E0CD", // light accent / dark-mode text
    500: "#066666", // primary — deep teal
    700: "#003D3D", // pressed / dark-mode primary
    900: "#002626",
  },
  // Lime accent — kept under the `saffron` key so existing `saffron-*` usages
  // (achievement, celebration, highlight) re-theme without renaming.
  saffron: {
    100: "#EFF5CE",
    500: "#B3CC18", // lime pop
    700: "#7B8F00",
  },
  ink: {
    1000: "#001F1F", // primary text — teal-black
    700: "#455252",
    500: "#6A7878",
    300: "#C4CCCC", // borders
    100: "#EBF0EF", // subtle fills
  },
  // Sidebar — dark teal-ink ground (worknation-style shell), constant across
  // light/dark. Active item fills with brand teal; the accent bar + active
  // icon use bright mint (brand-300) so they read on the dark ground.
  sidebar: {
    bg: "#07241F", // deep teal-ink ground
    border: "#143A34", // hairline dividers
    text: "#8FA8A1", // resting nav text
    "text-active": "#EAF2EF", // active / hovered text
    section: "#5E7872", // section labels, chevrons
    "item-hover": "#102E29", // hover surface
    "item-active": "#066666", // active item fill (brand-500)
    accent: "#51E0CD", // active bar + icon (brand-300 mint)
  },
  // Surfaces
  paper: "#FAF9F7", // warm sand app canvas
  paperWarm: "#F7F6F2", // softer sand (parent/student)
  paperDark: "#05201E", // deep teal-black (dark)
  surface: "#FFFFFF", // card surface (light)
  surfaceDark: "#0E322E", // card surface (dark)
  // Semantic
  success: "#1F9D55",
  warning: "#D97706",
  error: "#E11D48", // punchy rose — overdue / absent / destructive
  info: "#2D7CE0",
  white: "#FFFFFF",
} as const;

export const fonts = {
  sans: ["General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
  display: ["General Sans", "ui-sans-serif", "system-ui", "sans-serif"],
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
  input: "0.625rem", // 10 — softer inputs (worknation md/lg feel)
  button: "9999px", // pill buttons (worknation signature)
  card: "1rem", // 16 — cards/panels (worknation lg)
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
  focus: "0 0 0 2px #FAF9F7, 0 0 0 4px #066666", // 2px ring + 2px offset
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
