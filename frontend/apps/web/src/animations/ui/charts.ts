import type { Variants, Transition } from 'framer-motion';
import { DURATIONS } from '../constants';

/**
 * Container variants for staggered chart element reveals.
 *
 * @example
 * ```tsx
 * <motion.div
 *   variants={chartContainerVariants}
 *   initial="hidden"
 *   animate="visible"
 * >
 *   <motion.div variants={chartElementVariants}>Planet 1</motion.div>
 *   <motion.div variants={chartElementVariants}>Planet 2</motion.div>
 * </motion.div>
 * ```
 */
export const chartContainerVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

/**
 * Individual chart element variants for staggered entrance.
 */
export const chartElementVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    },
  },
};

/**
 * Variants for chart wheel/ring elements.
 */
export const chartRingVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    rotate: -10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      type: 'spring',
      stiffness: 150,
      damping: 15,
    },
  },
};

/**
 * Variants for planetary symbols on a chart.
 */
export const planetSymbolVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
  hover: {
    scale: 1.2,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 10,
    },
  },
};

/**
 * Emphasis pulse transition for highlighting chart elements.
 */
export const emphasisPulseTransition: Transition = {
  repeat: 2,
  duration: 0.3,
  ease: 'easeInOut',
};

/**
 * Creates emphasis animation props for highlighting a chart element.
 *
 * @example
 * ```tsx
 * const emphasisProps = useChartEmphasis();
 *
 * <motion.div
 *   animate={isHighlighted ? emphasisProps.animate : {}}
 *   transition={emphasisProps.transition}
 * >
 *   Planet Symbol
 * </motion.div>
 * ```
 */
export function useChartEmphasis() {
  return {
    animate: {
      scale: [1, 1.05, 1],
      boxShadow: [
        '0 0 0 0 rgba(255, 215, 0, 0)',
        '0 0 20px 4px rgba(255, 215, 0, 0.3)',
        '0 0 0 0 rgba(255, 215, 0, 0)',
      ],
    },
    transition: emphasisPulseTransition,
  };
}

/**
 * Glow animation for active/selected chart elements.
 */
export const chartGlowVariants: Variants = {
  inactive: {
    boxShadow: '0 0 0 0 rgba(255, 215, 0, 0)',
  },
  active: {
    boxShadow: [
      '0 0 5px 2px rgba(255, 215, 0, 0.2)',
      '0 0 15px 5px rgba(255, 215, 0, 0.4)',
      '0 0 5px 2px rgba(255, 215, 0, 0.2)',
    ],
    transition: {
      repeat: Infinity,
      duration: DURATIONS.slower,
    },
  },
};

/**
 * Orbit line draw animation variants.
 */
export const orbitLineVariants: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: {
    pathLength: 1,
    opacity: 0.5,
    transition: {
      pathLength: {
        duration: DURATIONS.slower,
        ease: 'easeInOut',
      },
      opacity: {
        duration: DURATIONS.fast,
      },
    },
  },
};
