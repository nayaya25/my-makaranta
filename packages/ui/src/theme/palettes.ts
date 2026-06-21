/**
 * Curated white-label palette map.
 * Each key maps to a coherent 50→900 brand ramp expressed as CSS custom properties.
 * `teal` mirrors packages/ui/tokens.ts `colors.brand` exactly and is the default fallback.
 */

export const PALETTE_KEYS = [
  "teal",
  "emerald",
  "indigo",
  "violet",
  "rose",
  "amber",
  "slate",
  "sky",
] as const satisfies readonly string[];

export type PaletteKey = (typeof PALETTE_KEYS)[number];

type BrandVars = {
  "--brand-50": string;
  "--brand-100": string;
  "--brand-300": string;
  "--brand-500": string;
  "--brand-700": string;
  "--brand-900": string;
};

/** Raw palette table — each entry is a 6-stop brand ramp (50/100/300/500/700/900). */
const PALETTES: Record<PaletteKey, BrandVars> = {
  // Mirrors tokens.ts colors.brand exactly.
  teal: {
    "--brand-50": "#DEF6F3",
    "--brand-100": "#B1F0E7",
    "--brand-300": "#51E0CD",
    "--brand-500": "#066666",
    "--brand-700": "#003D3D",
    "--brand-900": "#002626",
  },

  // Rich forest green — approachable, fresh.
  emerald: {
    "--brand-50": "#ECFDF5",
    "--brand-100": "#D1FAE5",
    "--brand-300": "#6EE7B7",
    "--brand-500": "#059669",
    "--brand-700": "#047857",
    "--brand-900": "#064E3B",
  },

  // Classic tech indigo — trustworthy, professional.
  indigo: {
    "--brand-50": "#EEF2FF",
    "--brand-100": "#E0E7FF",
    "--brand-300": "#A5B4FC",
    "--brand-500": "#4F46E5",
    "--brand-700": "#4338CA",
    "--brand-900": "#1E1B4B",
  },

  // Warm violet — creative, distinctive.
  violet: {
    "--brand-50": "#F5F3FF",
    "--brand-100": "#EDE9FE",
    "--brand-300": "#C4B5FD",
    "--brand-500": "#7C3AED",
    "--brand-700": "#6D28D9",
    "--brand-900": "#2E1065",
  },

  // Bold rose — energetic, modern.
  rose: {
    "--brand-50": "#FFF1F2",
    "--brand-100": "#FFE4E6",
    "--brand-300": "#FDA4AF",
    "--brand-500": "#E11D48",
    "--brand-700": "#BE123C",
    "--brand-900": "#881337",
  },

  // Warm amber — optimistic, welcoming.
  amber: {
    "--brand-50": "#FFFBEB",
    "--brand-100": "#FEF3C7",
    "--brand-300": "#FCD34D",
    "--brand-500": "#D97706",
    "--brand-700": "#B45309",
    "--brand-900": "#78350F",
  },

  // Neutral slate — understated, precise.
  slate: {
    "--brand-50": "#F8FAFC",
    "--brand-100": "#F1F5F9",
    "--brand-300": "#94A3B8",
    "--brand-500": "#475569",
    "--brand-700": "#334155",
    "--brand-900": "#0F172A",
  },

  // Bright sky blue — open, clear, trustworthy.
  sky: {
    "--brand-50": "#F0F9FF",
    "--brand-100": "#E0F2FE",
    "--brand-300": "#7DD3FC",
    "--brand-500": "#0284C7",
    "--brand-700": "#0369A1",
    "--brand-900": "#0C4A6E",
  },
};

/**
 * Returns a CSS-custom-property record for the given palette key.
 * Unknown keys fall back to `teal`.
 */
export function paletteVars(key: string): Record<string, string> {
  const palette = PALETTES[key as PaletteKey] ?? PALETTES.teal;
  return { ...palette };
}
