import type { Variants } from 'framer-motion';
import { DURATIONS, EASINGS } from '../constants';

/**
 * Page transition variants for route changes.
 * Use with AnimatePresence for smooth page transitions.
 *
 * @example
 * ```tsx
 * import { AnimatePresence, motion } from 'framer-motion';
 * import { pageVariants } from '@/animations/ui';
 *
 * function App() {
 *   const location = useLocation();
 *
 *   return (
 *     <AnimatePresence mode="wait">
 *       <motion.div
 *         key={location.pathname}
 *         variants={pageVariants}
 *         initial="initial"
 *         animate="animate"
 *         exit="exit"
 *       >
 *         <Routes>...</Routes>
 *       </motion.div>
 *     </AnimatePresence>
 *   );
 * }
 * ```
 */
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    x: 20,
  },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: DURATIONS.medium,
      ease: EASINGS.smooth,
    },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: {
      duration: DURATIONS.fast,
      ease: EASINGS.accelerate,
    },
  },
};

/**
 * Fade-only page transition for subtle route changes.
 */
export const pageFadeVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: DURATIONS.medium,
      ease: EASINGS.easeOut,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Scale + fade page transition for modal-like pages.
 */
export const pageScaleVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: DURATIONS.medium,
      ease: EASINGS.emphasized,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Slide up page transition for detail pages.
 */
export const pageSlideUpVariants: Variants = {
  initial: {
    opacity: 0,
    y: 30,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATIONS.medium,
      ease: EASINGS.decelerate,
    },
  },
  exit: {
    opacity: 0,
    y: -15,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};
