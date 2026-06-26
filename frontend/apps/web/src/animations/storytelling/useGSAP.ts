import { useRef, useEffect, useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

// Safe effect for SSR - useLayoutEffect on client, useEffect on server
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * GSAP context type for cleanup management.
 */
interface GSAPContext {
  add: (fn: () => void) => void;
  revert: () => void;
}

/**
 * Hook for using GSAP with proper React cleanup.
 * All GSAP animations created within the callback are automatically
 * cleaned up when the component unmounts.
 *
 * @param callback - Function that creates GSAP animations
 * @param deps - Dependency array (like useEffect)
 * @returns Ref to the GSAP context for manual control if needed
 *
 * @example
 * ```tsx
 * function HeroSection() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *
 *   useGSAP(() => {
 *     if (!containerRef.current) return;
 *
 *     gsap.from(containerRef.current.querySelectorAll('.star'), {
 *       opacity: 0,
 *       scale: 0,
 *       stagger: 0.02,
 *       duration: 0.8,
 *     });
 *   }, []);
 *
 *   return <div ref={containerRef}>...</div>;
 * }
 * ```
 */
export function useGSAP(
  callback: (context: GSAPContext) => void | (() => void),
  deps: React.DependencyList = []
) {
  const reducedMotion = useReducedMotion();
  const contextRef = useRef<GSAPContext | null>(null);

  useIsomorphicLayoutEffect(() => {
    // Skip all GSAP animations if user prefers reduced motion
    if (reducedMotion) {
      return;
    }

    // Create GSAP context for scoped cleanup
    const ctx = gsap.context(() => {});
    contextRef.current = ctx;

    // Run the callback and get optional cleanup function
    const cleanup = callback(ctx);

    return () => {
      // Run any custom cleanup
      if (typeof cleanup === 'function') {
        cleanup();
      }
      // Revert all GSAP animations in this context
      ctx.revert();
    };
  }, [reducedMotion, ...deps]);

  return contextRef;
}

/**
 * Hook for scroll-triggered animations with simplified API.
 *
 * @param elementRef - Ref to the element to animate
 * @param animation - GSAP animation properties
 * @param triggerOptions - ScrollTrigger configuration
 *
 * @example
 * ```tsx
 * function FeatureSection() {
 *   const sectionRef = useRef<HTMLElement>(null);
 *
 *   useScrollAnimation(
 *     sectionRef,
 *     { opacity: 1, y: 0, duration: 0.6 },
 *     { start: 'top 80%' }
 *   );
 *
 *   return (
 *     <section ref={sectionRef} style={{ opacity: 0, transform: 'translateY(50px)' }}>
 *       Content...
 *     </section>
 *   );
 * }
 * ```
 */
export function useScrollAnimation(
  elementRef: RefObject<HTMLElement | null>,
  animation: gsap.TweenVars,
  triggerOptions?: ScrollTrigger.Vars
) {
  const reducedMotion = useReducedMotion();

  useGSAP(() => {
    if (!elementRef.current || reducedMotion) return;

    gsap.to(elementRef.current, {
      ...animation,
      scrollTrigger: {
        trigger: elementRef.current,
        start: 'top 80%',
        end: 'bottom 20%',
        toggleActions: 'play none none reverse',
        ...triggerOptions,
      },
    });
  }, [reducedMotion]);
}

/**
 * Hook for creating GSAP timelines with proper cleanup.
 *
 * @param createTimeline - Function that creates and returns a GSAP timeline
 * @param deps - Dependency array
 * @returns Ref to the timeline for control (play, pause, reverse, etc.)
 *
 * @example
 * ```tsx
 * function IntroAnimation() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const timelineRef = useTimeline(() => {
 *     const tl = gsap.timeline({ paused: true });
 *
 *     tl.from('.title', { opacity: 0, y: 30, duration: 0.6 })
 *       .from('.subtitle', { opacity: 0, y: 20, duration: 0.4 }, '-=0.2')
 *       .from('.cta', { opacity: 0, scale: 0.9, duration: 0.4 }, '-=0.1');
 *
 *     return tl;
 *   }, []);
 *
 *   useEffect(() => {
 *     timelineRef.current?.play();
 *   }, []);
 *
 *   return <div ref={containerRef}>...</div>;
 * }
 * ```
 */
export function useTimeline(
  createTimeline: () => gsap.core.Timeline,
  deps: React.DependencyList = []
) {
  const reducedMotion = useReducedMotion();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (reducedMotion) {
      return;
    }

    const tl = createTimeline();
    timelineRef.current = tl;

    return () => {
      tl.kill();
      timelineRef.current = null;
    };
  }, [reducedMotion, ...deps]);

  return timelineRef;
}

/**
 * Utility to refresh all ScrollTrigger instances.
 * Call this after dynamic content changes that affect scroll height.
 */
export function refreshScrollTrigger() {
  ScrollTrigger.refresh();
}

/**
 * Utility to kill all ScrollTrigger instances.
 * Useful for route transitions or complete cleanup.
 */
export function killAllScrollTriggers() {
  ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
}

export { gsap, ScrollTrigger };
