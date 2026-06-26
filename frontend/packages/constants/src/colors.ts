/**
 * AlmaMesh Design System — Colors (CANONICAL source of truth)
 *
 * Aesthetic: "Observatory instrument / celestial cartography" — antique brass
 * astrolabe meets a modern dark observatory readout. Obsidian-indigo base
 * (never pure black), warm brass-gold primary accent, lapis-indigo secondary,
 * warm ivory/parchment text. Sharp accents over a dominant dark base.
 *
 * This object is the single source of truth: `apps/web/tailwind.config.ts`
 * imports it and generates `theme.extend.colors` from it. All key names that
 * either the constants file OR the app's tailwind config previously used are
 * preserved here as a union superset so no existing className breaks.
 */

export const colors = {
  // Obsidian-indigo surfaces — deep, slightly blue-black. Never pure black.
  background: {
    primary: '#0B0E17', // Deep observatory base
    secondary: '#11151F', // Card / panel surfaces
    tertiary: '#1A1F2E', // Elevated surfaces / hover
    darker: '#0E121B', // Tables / nested cards
    darkest: '#080A11', // Darkest nested wells
    elevated: '#151A26', // Slightly raised surface
  },

  // Warm ivory / parchment text on dark, muted brass-gray for secondary.
  text: {
    primary: '#F4F1E8', // Parchment — headings / strong
    secondary: '#C7C2B2', // Muted brass-gray — secondary
    muted: '#8A8576', // Faint engraved label
    'muted-alt': '#9A958A', // Alternative muted (tables)
    body: '#ECE6D8', // Warm ivory body copy
  },

  // Brass-gold primary, lapis-indigo secondary. Use sparingly + intentionally.
  accent: {
    gold: '#C9A24B', // Astrolabe brass (primary)
    'gold-bright': '#E3B85A', // Polished brass (hover / highlight)
    purple: '#3A4FB0', // Lapis-indigo (secondary) — legacy key reused
    blue: '#5468C8', // Lapis interactive / links
    lapis: '#3A4FB0', // Explicit lapis alias
  },

  // Planet colors — observatory-tuned, traditional Vedic associations.
  // Lowercase keys are CANONICAL (sun..ketu). See PLANET_COLORS below.
  planets: {
    sun: '#E3B85A', // Brass-gold — vitality, authority
    moon: '#D8D4C6', // Silver-ivory — mind, emotions
    mars: '#C84A3A', // Oxide red — energy, courage
    mercury: '#5FA88A', // Verdigris — intellect, communication
    jupiter: '#D9A23B', // Amber-gold — wisdom, expansion
    venus: '#C98AA8', // Rose-quartz — love, beauty
    saturn: '#3A4FB0', // Lapis — discipline, karma
    rahu: '#7A7E8C', // Slate — obsession, illusion
    ketu: '#5C5F6B', // Deep slate — detachment
  },

  // Zodiac sign colors — observatory-tuned.
  signs: {
    aries: '#C84A3A',
    taurus: '#5FA88A',
    gemini: '#E3B85A',
    cancer: '#D8D4C6',
    leo: '#D97B3B',
    virgo: '#5F8A6A',
    libra: '#C98AA8',
    scorpio: '#8A3A3A',
    sagittarius: '#D9602E',
    capricorn: '#3A4FB0',
    aquarius: '#4AA0A8',
    pisces: '#6A5FB0',
  },

  // Status colors.
  status: {
    success: '#5FA877',
    warning: '#D9A23B',
    error: '#C84A3A',
    info: '#5468C8',
    // Dignity states for planetary positions.
    exalted: '#7FBF8E', // Exalted planets
    debilitated: '#D98080', // Debilitated planets
    'own-sign': '#7E92D6', // Own sign
    combust: '#E3B85A', // Combust / retrograde (brass amber)
  },

  // UI element colors — hairline engraved borders, low contrast.
  ui: {
    border: '#262B38', // Hairline engraved border
    'border-dark': '#1B1F2A', // Darker border variant (tables)
    borderLight: '#333A4A', // Lighter hairline
    focus: '#C9A24B', // Brass focus ring
    disabled: '#3A3F4C',
    overlay: 'rgba(8, 10, 17, 0.72)', // Obsidian overlay
    card: '#11151F',
    cardHover: '#1A1F2E',
  },
} as const;

export type Colors = typeof colors;

/**
 * Canonical planet color map. Lowercase keys (sun..ketu). This is the ONE
 * source for planet colors used across SVG charts and 3D timelines — do not
 * re-declare hardcoded planet hex maps elsewhere; import this instead.
 */
export const PLANET_COLORS = colors.planets;

export type PlanetColors = typeof PLANET_COLORS;

/**
 * Optional design-token primitives (spacing / radii / shadows). Kept small and
 * additive; consumers may import what they need. Tailwind continues to own the
 * spacing scale — these are for ad-hoc inline use.
 */
export const tokens = {
  radii: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },
  shadows: {
    // Subtle, warm — like light catching brass in a dark room.
    engraved: 'inset 0 1px 0 0 rgba(244, 241, 232, 0.04)',
    panel: '0 8px 32px -12px rgba(0, 0, 0, 0.6)',
    brass: '0 0 0 1px rgba(201, 162, 75, 0.4), 0 4px 16px -4px rgba(201, 162, 75, 0.2)',
  },
  easing: {
    // Measured, orbital easing.
    orbital: 'cubic-bezier(0.22, 1, 0.36, 1)',
    orbitalIn: 'cubic-bezier(0.5, 0, 0.75, 0)',
  },
} as const;

export type Tokens = typeof tokens;
