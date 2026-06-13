/**
 * Design tokens — the single source of truth for myMakaranta's visual language.
 * Encodes the PRD design system: indigo primary (culturally resonant, trustworthy),
 * saffron accent, warm neutrals, Inter/General Sans/Newsreader type, ease-out-expo motion,
 * and a considered elevation scale. Tailwind consumes this via tailwind-preset.ts —
 * components reference tokens through Tailwind classes, never raw hex.
 */

export const colors = {
  brand: {
    50: "#EEF1FF",
    100: "#D6DDFD",
    300: "#7B8DF5",
    500: "#3D52E0", // primary — buttons, links, brand surfaces
    700: "#1F2D8A", // pressed / dark-mode primary
    900: "#0E1547",
  },
  saffron: {
    100: "#FEF3D9",
    500: "#E8A33C", // achievement / celebration accent
    700: "#A06A1A",
  },
  ink: {
    1000: "#0A0B12", // primary text on light; base canvas (dark)
    700: "#3A3D4A",
    500: "#7A7E8E",
    300: "#C7C9D1",
    100: "#EFEFF3",
  },
  paper: "#FAFAF7", // warm off-white canvas (light)
  paperDark: "#0E0F14", // base canvas (dark) — not pure black, reduces OLED smear
  success: "#1F9D55",
  warning: "#D97706",
  error: "#D02B2B",
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

export const radius = {
  none: "0",
  sm: "0.375rem",
  input: "0.625rem",
  button: "0.625rem",
  card: "1rem",
  sheet: "1.25rem",
  pill: "9999px",
} as const;

/** Elevation scale — soft, layered shadows for considered card depth (not harsh drop shadows). */
export const shadow = {
  none: "none",
  xs: "0 1px 2px 0 rgb(10 11 18 / 0.04)",
  sm: "0 1px 3px 0 rgb(10 11 18 / 0.06), 0 1px 2px -1px rgb(10 11 18 / 0.06)",
  md: "0 4px 12px -2px rgb(10 11 18 / 0.08), 0 2px 6px -2px rgb(10 11 18 / 0.05)",
  lg: "0 12px 28px -6px rgb(10 11 18 / 0.12), 0 6px 12px -6px rgb(10 11 18 / 0.08)",
  xl: "0 24px 48px -12px rgb(10 11 18 / 0.18), 0 12px 24px -12px rgb(10 11 18 / 0.1)",
  focus: "0 0 0 2px #FAFAF7, 0 0 0 4px #3D52E0", // 2px ring + 2px offset
} as const;

/** Motion — custom ease-out-expo; linear forbidden except indeterminate progress. */
export const motion = {
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  duration: {
    micro: "120ms", // toggles, hover, focus
    standard: "240ms", // page transitions, modal open/close
    hero: "560ms", // signature moments (results reveal, payment success)
  },
} as const;

export const tokens = { colors, fonts, fontSize, spacing, radius, shadow, motion } as const;
export type Tokens = typeof tokens;
