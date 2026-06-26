/**
 * Animation breakpoints for responsive animation behavior.
 * Reduces animation complexity on smaller/less powerful devices.
 */

export interface AnimationBreakpoint {
  /** Maximum width for this breakpoint */
  maxWidth: number;
  /** Whether to reduce animation complexity */
  reduceComplexity: boolean;
  /** Whether to disable parallax effects */
  disableParallax: boolean;
  /** Maximum particle/element count multiplier (1.0 = full, 0.5 = half) */
  elementMultiplier: number;
}

export const ANIMATION_BREAKPOINTS: Record<string, AnimationBreakpoint> = {
  mobile: {
    maxWidth: 768,
    reduceComplexity: true,
    disableParallax: true,
    elementMultiplier: 0.4,
  },
  tablet: {
    maxWidth: 1024,
    reduceComplexity: false,
    disableParallax: false,
    elementMultiplier: 0.7,
  },
  desktop: {
    maxWidth: Infinity,
    reduceComplexity: false,
    disableParallax: false,
    elementMultiplier: 1.0,
  },
} as const;

/**
 * Get the appropriate breakpoint config based on window width.
 */
export function getAnimationBreakpoint(width: number): AnimationBreakpoint {
  if (width <= ANIMATION_BREAKPOINTS.mobile.maxWidth) {
    return ANIMATION_BREAKPOINTS.mobile;
  }
  if (width <= ANIMATION_BREAKPOINTS.tablet.maxWidth) {
    return ANIMATION_BREAKPOINTS.tablet;
  }
  return ANIMATION_BREAKPOINTS.desktop;
}
