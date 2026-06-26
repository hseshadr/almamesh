import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user prefers reduced motion.
 * Essential for accessibility - all animations should check this.
 *
 * @returns true if user prefers reduced motion, false otherwise
 *
 * @example
 * ```tsx
 * function AnimatedCard({ children }: { children: React.ReactNode }) {
 *   const reducedMotion = useReducedMotion();
 *
 *   return (
 *     <motion.div
 *       initial={reducedMotion ? false : { opacity: 0, y: 20 }}
 *       animate={{ opacity: 1, y: 0 }}
 *       transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
 *     >
 *       {children}
 *     </motion.div>
 *   );
 * }
 * ```
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    // Check on initial render (SSR-safe)
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Set initial value
    setReducedMotion(mediaQuery.matches);

    // Listen for changes
    const handler = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}

export default useReducedMotion;
