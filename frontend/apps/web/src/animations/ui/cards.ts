import type { Variants, PanInfo } from 'framer-motion';
import { DURATIONS } from '../constants';

/**
 * Card entrance variants with stagger support.
 */
export const cardContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

/**
 * Individual card entrance animation.
 */
export const cardVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 250,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Card hover/tap interaction variants.
 */
export const cardInteractionVariants: Variants = {
  rest: {
    scale: 1,
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  },
  hover: {
    scale: 1.02,
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 20,
    },
  },
  tap: {
    scale: 0.98,
    transition: {
      type: 'spring',
      stiffness: 600,
      damping: 20,
    },
  },
};

/**
 * Card flip animation variants.
 */
export const cardFlipVariants: Variants = {
  front: {
    rotateY: 0,
    transition: {
      duration: DURATIONS.medium,
    },
  },
  back: {
    rotateY: 180,
    transition: {
      duration: DURATIONS.medium,
    },
  },
};

/**
 * Card stack animation config for stacked cards.
 * Each card offset is calculated based on index.
 */
export function getStackedCardStyle(index: number, total: number) {
  const maxOffset = 20;
  const maxRotation = 5;
  const offsetStep = maxOffset / Math.max(total - 1, 1);
  const rotationStep = maxRotation / Math.max(total - 1, 1);

  return {
    y: index * offsetStep,
    rotate: (index - Math.floor(total / 2)) * rotationStep,
    scale: 1 - index * 0.02,
    zIndex: total - index,
  };
}

/**
 * Swipe card variants for dismissible cards.
 */
export const swipeCardVariants: Variants = {
  center: {
    x: 0,
    rotate: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  swipedLeft: {
    x: -300,
    rotate: -20,
    opacity: 0,
  },
  swipedRight: {
    x: 300,
    rotate: 20,
    opacity: 0,
  },
};

/**
 * Creates a swipe handler for card actions.
 *
 * @param onSwipeLeft - Called when swiped left
 * @param onSwipeRight - Called when swiped right
 * @param threshold - Minimum drag distance to trigger (default: 100)
 */
export function createSwipeHandler(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  threshold: number = 100
) {
  return (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.x < -threshold && onSwipeLeft) {
      onSwipeLeft();
    } else if (info.offset.x > threshold && onSwipeRight) {
      onSwipeRight();
    }
  };
}

/**
 * Drag constraints for swipeable cards.
 */
export const swipeDragConstraints = {
  top: 0,
  bottom: 0,
  left: -150,
  right: 150,
};
