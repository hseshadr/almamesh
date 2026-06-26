import { useState, useEffect, useMemo } from 'react';
import { getAnimationBreakpoint, type AnimationBreakpoint } from '../animations/constants';
import { useReducedMotion } from './useReducedMotion';

/**
 * Hook for adaptive animation performance based on device capabilities.
 * Automatically adjusts animation complexity for different screen sizes
 * and respects user's reduced motion preference.
 *
 * @returns Animation performance configuration
 *
 * @example
 * ```tsx
 * function StarField() {
 *   const { particleCount, shouldAnimate, enableParallax } = useAnimationPerformance();
 *
 *   if (!shouldAnimate) {
 *     return <StaticStarField />;
 *   }
 *
 *   return (
 *     <AnimatedStarField
 *       count={particleCount}
 *       parallax={enableParallax}
 *     />
 *   );
 * }
 * ```
 */
export function useAnimationPerformance() {
  const prefersReducedMotion = useReducedMotion();
  const [windowWidth, setWindowWidth] = useState(() => {
    if (typeof window === 'undefined') return 1024;
    return window.innerWidth;
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const breakpoint: AnimationBreakpoint = useMemo(
    () => getAnimationBreakpoint(windowWidth),
    [windowWidth]
  );

  return useMemo(
    () => ({
      /** Whether animations should play at all */
      shouldAnimate: !prefersReducedMotion,

      /** Particle/element count adjusted for performance (default: 50) */
      particleCount: Math.round(50 * breakpoint.elementMultiplier),

      /** Whether to enable parallax effects */
      enableParallax: !breakpoint.disableParallax && !prefersReducedMotion,

      /** Whether to reduce animation complexity */
      reduceComplexity: breakpoint.reduceComplexity || prefersReducedMotion,

      /** Current breakpoint configuration */
      breakpoint,

      /** Device type based on width */
      deviceType:
        windowWidth <= 768 ? 'mobile' : windowWidth <= 1024 ? 'tablet' : 'desktop',

      /** Raw element multiplier for custom calculations */
      elementMultiplier: breakpoint.elementMultiplier,
    }),
    [prefersReducedMotion, breakpoint, windowWidth]
  );
}

export default useAnimationPerformance;
