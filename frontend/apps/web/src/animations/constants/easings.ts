/**
 * Animation easing constants for consistent motion feel.
 * Includes both Framer Motion compatible and GSAP-specific easings.
 */

/** Standard easings compatible with both Framer Motion and CSS */
export const EASINGS = {
  // Standard named easings (Framer Motion compatible)
  linear: 'linear' as const,
  easeIn: 'easeIn' as const,
  easeOut: 'easeOut' as const,
  easeInOut: 'easeInOut' as const,

  // Custom cubic-bezier curves (works with both libraries)
  /** Smooth deceleration - good for entrances */
  smooth: [0.4, 0, 0.2, 1] as const,
  /** Emphasized ending - for important reveals */
  emphasized: [0.4, 0, 0, 1] as const,
  /** Quick start, slow end - for elements leaving */
  decelerate: [0, 0, 0.2, 1] as const,
  /** Slow start, quick end - for elements entering */
  accelerate: [0.4, 0, 1, 1] as const,
} as const;

/** GSAP-specific named easings for storytelling animations */
export const GSAP_EASINGS = {
  /** Smooth power curve - standard GSAP ease */
  smooth: 'power2.out',
  /** Stronger deceleration */
  smoothStrong: 'power3.out',
  /** Bounce at the end */
  bounce: 'bounce.out',
  /** Elastic overshoot */
  elastic: 'elastic.out(1, 0.3)',
  /** Back and overshoot */
  back: 'back.out(1.7)',
  /** Smooth in and out */
  inOut: 'power2.inOut',
} as const;

export type EasingKey = keyof typeof EASINGS;
export type GsapEasingKey = keyof typeof GSAP_EASINGS;
