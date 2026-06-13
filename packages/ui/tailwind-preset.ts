import type { Config } from "tailwindcss";
import { colors, fonts, fontSize, radius, shadow, motion } from "./tokens";

/** Shared Tailwind preset built from tokens.ts. Apps and the UI package extend this. */
export const preset = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        saffron: colors.saffron,
        ink: colors.ink,
        paper: { DEFAULT: colors.paper, dark: colors.paperDark },
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info,
      },
      fontFamily: {
        sans: fonts.sans as unknown as string[],
        display: fonts.display as unknown as string[],
        serif: fonts.serif as unknown as string[],
      },
      fontSize: {
        display: fontSize.display as unknown as [string, string],
        h1: fontSize.h1 as unknown as [string, string],
        h2: fontSize.h2 as unknown as [string, string],
        h3: fontSize.h3 as unknown as [string, string],
        body: fontSize.body as unknown as [string, string],
        small: fontSize.small as unknown as [string, string],
        caption: fontSize.caption as unknown as [string, string],
      },
      borderRadius: {
        sm: radius.sm,
        input: radius.input,
        button: radius.button,
        card: radius.card,
        sheet: radius.sheet,
      },
      boxShadow: {
        xs: shadow.xs,
        sm: shadow.sm,
        md: shadow.md,
        lg: shadow.lg,
        xl: shadow.xl,
        focus: shadow.focus,
      },
      transitionTimingFunction: {
        expo: motion.ease,
        "in-out-smooth": motion.easeInOut,
      },
      transitionDuration: {
        micro: motion.duration.micro,
        standard: motion.duration.standard,
        hero: motion.duration.hero,
      },
    },
  },
} satisfies Partial<Config>;

export default preset;
