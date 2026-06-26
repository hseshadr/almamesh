/**
 * AlmaMesh Design System Constants
 *
 * Centralized design tokens for consistent styling across the application.
 * These constants complement Tailwind CSS configuration.
 *
 * Usage:
 * import { SPACING, TYPOGRAPHY, SHADOWS, ANIMATIONS } from '@/styles/design-system';
 */

// ============================================================================
// SPACING CONSTANTS
// ============================================================================

/**
 * Spacing scale for consistent padding/margins/gaps.
 * Maps to Tailwind spacing values.
 */
export const SPACING = {
  /** 4px - Extra small spacing for tight elements */
  xs: '1',   // p-1, gap-1, etc.
  /** 8px - Small spacing for compact cards */
  sm: '2',   // p-2, gap-2
  /** 12px - Medium-small spacing */
  md: '3',   // p-3, gap-3
  /** 16px - Standard spacing */
  lg: '4',   // p-4, gap-4
  /** 24px - Large spacing for sections */
  xl: '6',   // p-6, gap-6
  /** 32px - Extra large spacing */
  '2xl': '8', // p-8, gap-8
} as const;

/**
 * Card-specific spacing presets
 */
export const CARD_SPACING = {
  /** Small cards: p-4, gap-3 */
  small: {
    padding: 'p-4',
    gap: 'gap-3',
  },
  /** Medium cards: p-5, gap-4 */
  medium: {
    padding: 'p-5',
    gap: 'gap-4',
  },
  /** Large cards/sections: p-6, gap-4 */
  large: {
    padding: 'p-6',
    gap: 'gap-4',
  },
  /** Extra large sections: p-8, gap-6 */
  section: {
    padding: 'p-8',
    gap: 'gap-6',
  },
} as const;

// ============================================================================
// TYPOGRAPHY CONSTANTS
// ============================================================================

/**
 * Typography variants with Tailwind classes.
 * Includes font size, weight, line height, and letter spacing.
 */
export const TYPOGRAPHY = {
  /** Display heading - Hero sections */
  display: {
    className: 'text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight',
    size: '4xl',
    weight: 'bold',
    tracking: 'tight',
    leading: 'tight',
  },
  /** H1 - Page titles */
  h1: {
    className: 'text-3xl md:text-4xl font-bold tracking-tight leading-tight',
    size: '3xl',
    weight: 'bold',
    tracking: 'tight',
    leading: 'tight',
  },
  /** H2 - Section titles */
  h2: {
    className: 'text-2xl md:text-3xl font-semibold tracking-tight leading-snug',
    size: '2xl',
    weight: 'semibold',
    tracking: 'tight',
    leading: 'snug',
  },
  /** H3 - Card titles */
  h3: {
    className: 'text-xl font-semibold leading-snug',
    size: 'xl',
    weight: 'semibold',
    tracking: 'normal',
    leading: 'snug',
  },
  /** H4 - Subsection titles */
  h4: {
    className: 'text-lg font-semibold leading-snug',
    size: 'lg',
    weight: 'semibold',
    tracking: 'normal',
    leading: 'snug',
  },
  /** Body - Standard text */
  body: {
    className: 'text-base font-normal leading-relaxed',
    size: 'base',
    weight: 'normal',
    tracking: 'normal',
    leading: 'relaxed',
  },
  /** Body small - Secondary text */
  bodySmall: {
    className: 'text-sm font-normal leading-relaxed',
    size: 'sm',
    weight: 'normal',
    tracking: 'normal',
    leading: 'relaxed',
  },
  /** Caption - Small labels */
  caption: {
    className: 'text-xs font-normal leading-normal',
    size: 'xs',
    weight: 'normal',
    tracking: 'normal',
    leading: 'normal',
  },
  /** Overline - All caps labels */
  overline: {
    className: 'text-xs font-semibold uppercase tracking-wider leading-normal',
    size: 'xs',
    weight: 'semibold',
    tracking: 'wider',
    leading: 'normal',
  },
  /** Mono - Code/data display */
  mono: {
    className: 'font-mono text-xs leading-normal',
    size: 'xs',
    weight: 'normal',
    tracking: 'normal',
    leading: 'normal',
  },
} as const;

// ============================================================================
// SHADOW VARIANTS
// ============================================================================

/**
 * Shadow variants for elevation.
 * Use with Tailwind's shadow utilities.
 */
export const SHADOWS = {
  /** No shadow */
  none: 'shadow-none',
  /** Subtle shadow for cards */
  sm: 'shadow-sm',
  /** Standard shadow */
  md: 'shadow-md',
  /** Elevated shadow for modals/dropdowns */
  lg: 'shadow-lg',
  /** High elevation */
  xl: 'shadow-xl',
  /** Gold glow effect for accent elements */
  glow: 'shadow-[0_0_20px_rgba(255,215,0,0.15)]',
  /** Purple glow for secondary accents */
  glowPurple: 'shadow-[0_0_20px_rgba(139,92,246,0.15)]',
  /** Error glow */
  glowError: 'shadow-[0_0_15px_rgba(239,68,68,0.2)]',
  /** Success glow */
  glowSuccess: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]',
} as const;

// ============================================================================
// BORDER RADIUS CONSTANTS
// ============================================================================

/**
 * Border radius scale.
 * Maps to Tailwind rounded utilities.
 */
export const RADIUS = {
  /** No rounding */
  none: 'rounded-none',
  /** Small rounding: 4px */
  sm: 'rounded-sm',
  /** Standard rounding: 6px */
  md: 'rounded-md',
  /** Medium-large rounding: 8px */
  lg: 'rounded-lg',
  /** Large rounding: 12px */
  xl: 'rounded-xl',
  /** Extra large rounding: 16px */
  '2xl': 'rounded-2xl',
  /** Full rounding (pills) */
  full: 'rounded-full',
} as const;

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

/**
 * CSS transition presets for Tailwind.
 * Use for non-Framer Motion animations.
 */
export const TRANSITIONS = {
  /** Fast micro-interactions: 150ms */
  fast: 'transition-all duration-150 ease-out',
  /** Standard transitions: 200ms */
  normal: 'transition-all duration-200 ease-out',
  /** Smooth transitions: 300ms */
  smooth: 'transition-all duration-300 ease-out',
  /** Slow transitions: 500ms */
  slow: 'transition-all duration-500 ease-out',
  /** Colors only: 150ms */
  colors: 'transition-colors duration-150 ease-out',
  /** Transform only: 200ms */
  transform: 'transition-transform duration-200 ease-out',
  /** Opacity only: 200ms */
  opacity: 'transition-opacity duration-200 ease-out',
} as const;

/**
 * Framer Motion animation variants for common patterns.
 * These complement the animations in @/animations/ui.
 */
export const MOTION_VARIANTS = {
  /** Scale + fade for cards */
  scaleFade: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  /** Slide up + fade for content */
  slideUpFade: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  /** Slide in from left */
  slideLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },
  /** Slide in from right */
  slideRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  /** Simple fade */
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  /** Hover lift effect for cards */
  hoverLift: {
    rest: { y: 0, scale: 1 },
    hover: { y: -2, scale: 1.01 },
  },
  /** Button press effect */
  buttonPress: {
    rest: { scale: 1 },
    hover: { scale: 1.02 },
    tap: { scale: 0.98 },
  },
} as const;

/**
 * Stagger container configuration for lists.
 */
export const STAGGER_CONTAINER = {
  initial: 'initial',
  animate: 'animate',
  variants: {
    initial: {},
    animate: {
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  },
} as const;

// ============================================================================
// REDUCED MOTION HELPERS
// ============================================================================

/**
 * Motion preference classes.
 * Apply these for reduced motion support.
 */
export const REDUCED_MOTION = {
  /** Hide animations for reduced motion preference */
  hide: 'motion-safe:block motion-reduce:hidden',
  /** Disable transitions */
  noTransition: 'motion-reduce:transition-none',
  /** Disable transforms */
  noTransform: 'motion-reduce:transform-none',
  /** Full no-motion override */
  none: 'motion-reduce:transition-none motion-reduce:transform-none motion-reduce:animate-none',
} as const;

// ============================================================================
// INTERACTIVE ELEMENT STYLES
// ============================================================================

/**
 * Pre-built interactive element class combinations.
 */
export const INTERACTIVE = {
  /** Clickable card with hover/focus states */
  card: `
    cursor-pointer
    transition-all duration-200 ease-out
    hover:bg-background-tertiary/30
    hover:-translate-y-0.5
    hover:shadow-md
    focus:outline-none focus:ring-2 focus:ring-accent-gold/50
    motion-reduce:transition-none motion-reduce:transform-none
  `.replace(/\s+/g, ' ').trim(),

  /** Button with press feedback */
  button: `
    transition-all duration-150 ease-out
    hover:scale-[1.02]
    active:scale-[0.98]
    focus:outline-none focus:ring-2 focus:ring-accent-gold/50
    motion-reduce:transform-none
  `.replace(/\s+/g, ' ').trim(),

  /** Link with underline animation */
  link: `
    relative
    after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px
    after:bg-current after:transition-all after:duration-200
    hover:after:w-full
    focus:outline-none focus:ring-2 focus:ring-accent-gold/50 focus:ring-offset-2 focus:ring-offset-background-primary
  `.replace(/\s+/g, ' ').trim(),

  /** List item with background highlight */
  listItem: `
    transition-colors duration-150 ease-out
    hover:bg-background-tertiary/30
    focus:outline-none focus:bg-background-tertiary/40
  `.replace(/\s+/g, ' ').trim(),

  /** Icon button with rotate effect */
  iconButton: `
    transition-all duration-200 ease-out
    hover:scale-110 hover:rotate-3
    active:scale-95
    focus:outline-none focus:ring-2 focus:ring-accent-gold/50
    motion-reduce:transform-none
  `.replace(/\s+/g, ' ').trim(),
} as const;

// ============================================================================
// SHIMMER / LOADING ANIMATION
// ============================================================================

/**
 * Shimmer effect for skeleton loading states.
 * Apply to placeholder elements.
 */
export const SHIMMER = {
  /** Base shimmer background */
  base: 'animate-pulse bg-ui-border-dark',
  /** Full shimmer class with gradient animation */
  gradient: `
    relative overflow-hidden
    before:absolute before:inset-0
    before:-translate-x-full
    before:animate-[shimmer_2s_infinite]
    before:bg-gradient-to-r
    before:from-transparent before:via-white/10 before:to-transparent
  `.replace(/\s+/g, ' ').trim(),
} as const;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type SpacingKey = keyof typeof SPACING;
export type CardSpacingKey = keyof typeof CARD_SPACING;
export type TypographyVariant = keyof typeof TYPOGRAPHY;
export type ShadowVariant = keyof typeof SHADOWS;
export type RadiusKey = keyof typeof RADIUS;
export type TransitionKey = keyof typeof TRANSITIONS;
export type MotionVariantKey = keyof typeof MOTION_VARIANTS;
export type InteractiveKey = keyof typeof INTERACTIVE;
