/**
 * AlmaMesh Tailwind CSS Preset
 *
 * Shared Tailwind theme configuration for all AlmaMesh apps.
 * This preset defines the cosmic dark theme colors and typography.
 *
 * Usage in apps:
 * ```js
 * // tailwind.config.js (Next.js web app)
 * import sharedPreset from "@almamesh/constants/tailwind.preset";
 *
 * export default {
 *   presets: [sharedPreset],
 *   content: ["./src/**\/*.{ts,tsx}"],
 * };
 *
 * // tailwind.config.js (React Native/NativeWind)
 * const sharedPreset = require("@almamesh/constants/tailwind.preset");
 *
 * module.exports = {
 *   presets: [require("nativewind/preset"), sharedPreset],
 *   content: ["./app/**\/*.{ts,tsx}", "./components/**\/*.{ts,tsx}"],
 * };
 * ```
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Cosmic dark theme
        background: {
          primary: '#0A0A1A',    // Deep space
          secondary: '#12122A',  // Card backgrounds
          tertiary: '#1A1A3A',   // Elevated surfaces
        },
        // Text colors
        text: {
          primary: '#FFFFFF',
          secondary: '#A0A0B0',
          muted: '#606070',
        },
        // Accent colors
        accent: {
          gold: '#FFD700',       // Primary accent
          purple: '#8B5CF6',     // Secondary accent
          blue: '#3B82F6',       // Links, interactive
        },
        // Planet colors (traditional)
        planet: {
          sun: '#FFD700',
          moon: '#E0E0E0',
          mars: '#FF4444',
          mercury: '#00AA00',
          jupiter: '#FFAA00',
          venus: '#FF69B4',
          saturn: '#4444FF',
          rahu: '#808080',
          ketu: '#606060',
        },
        // Status colors
        status: {
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
        },
        // UI element colors
        ui: {
          border: '#2A2A4A',    // Border color for cards, inputs
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
