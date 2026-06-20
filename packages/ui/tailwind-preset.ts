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
        sidebar: colors.sidebar,
        ink: colors.ink,
        paper: { DEFAULT: colors.paper, warm: colors.paperWarm, dark: colors.paperDark },
        surface: { DEFAULT: colors.surface, dark: colors.surfaceDark },
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
      // Numeric weight aliases. The apps + marketing landing reference weights as
      // `font-500/600/700` (General Sans ships these). Tailwind core only emits the
      // named utilities (`font-medium/semibold/bold`), so without these the numeric
      // classes are silently inert and headings collapse to 400. Named utilities are
      // preserved via `extend`.
      fontWeight: {
        400: "400",
        500: "500",
        600: "600",
        700: "700",
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
        warm: radius.warm,
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
