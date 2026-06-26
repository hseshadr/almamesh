import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";
import { colors } from "@almamesh/constants";

/**
 * Tailwind colors are GENERATED from `@almamesh/constants` so there is exactly
 * ONE source of truth for the palette. The constants `colors` object is already
 * shaped as Tailwind's nested color map (background.primary, text.secondary,
 * accent.gold, ui.border, status.*, planets.*, …), so we spread it directly.
 * Existing className usages keep resolving because the key names are preserved.
 */
const themeColors = colors as unknown as Record<string, Record<string, string>>;

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      typography: {
        // Dark observatory prose — parchment body on obsidian, brass accents.
        DEFAULT: {
          css: {
            "--tw-prose-body": colors.text.body,
            "--tw-prose-headings": colors.text.primary,
            "--tw-prose-lead": colors.text.secondary,
            "--tw-prose-bold": colors.text.primary,
            "--tw-prose-counters": colors.accent.gold,
            "--tw-prose-bullets": colors.accent.gold,
            "--tw-prose-hr": colors.ui.border,
            "--tw-prose-quotes": colors.text.secondary,
            "--tw-prose-quote-borders": colors.accent.gold,
            "--tw-prose-captions": colors.text.muted,
            "--tw-prose-code": colors.accent["gold-bright"],
            "--tw-prose-pre-code": colors.text.body,
            "--tw-prose-pre-bg": colors.background.darker,
            "--tw-prose-th-borders": colors.ui.border,
            "--tw-prose-td-borders": colors.ui["border-dark"],
          },
        },
      },
      colors: themeColors,
      fontFamily: {
        // Observatory typography — manuscript display, humanist body, mono readouts.
        display: ["Fraunces Variable", "Fraunces", "Georgia", "serif"],
        sans: ["Hanken Grotesk Variable", "Hanken Grotesk", "system-ui", "sans-serif"],
        mono: ["Spline Sans Mono Variable", "Spline Sans Mono", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        // Measured, orbital easing.
        orbital: "cubic-bezier(0.22, 1, 0.36, 1)",
        "orbital-in": "cubic-bezier(0.5, 0, 0.75, 0)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "orbit-spin": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        "fade-in-up": "fade-in-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "orbit-spin": "orbit-spin 1.1s cubic-bezier(0.5, 0, 0.5, 1) infinite",
      },
    },
  },
  plugins: [tailwindAnimate, typography],
};

export default config;
