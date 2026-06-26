import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { pageVariants } from '../animations/ui';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface AnimatedPageProps {
  children: ReactNode;
  /** Custom variants to override default page transition */
  variants?: typeof pageVariants;
  /** Additional CSS class */
  className?: string;
}

/**
 * Wrapper component for animated page transitions.
 * Use with AnimatePresence and React Router for smooth route changes.
 *
 * @example
 * ```tsx
 * import { AnimatePresence } from 'framer-motion';
 * import { Routes, Route, useLocation } from 'react-router-dom';
 * import { AnimatedPage } from '@/components/AnimatedPage';
 *
 * function App() {
 *   const location = useLocation();
 *
 *   return (
 *     <AnimatePresence mode="wait">
 *       <Routes location={location} key={location.pathname}>
 *         <Route path="/dashboard" element={
 *           <AnimatedPage>
 *             <Dashboard />
 *           </AnimatedPage>
 *         } />
 *       </Routes>
 *     </AnimatePresence>
 *   );
 * }
 * ```
 */
export function AnimatedPage({
  children,
  variants = pageVariants,
  className = '',
}: AnimatedPageProps) {
  const reducedMotion = useReducedMotion();

  // Skip animation for users who prefer reduced motion
  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default AnimatedPage;
