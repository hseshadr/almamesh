import type { Variants } from 'framer-motion';
import { DURATIONS } from '../constants';

/**
 * Chat message container variants for staggered message entrance.
 */
export const chatContainerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

/**
 * Incoming message variants (from left/other user).
 */
export const incomingMessageVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 30,
    },
  },
};

/**
 * Outgoing message variants (from right/current user).
 */
export const outgoingMessageVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 30,
    },
  },
};

/**
 * System message variants (centered, subtle).
 */
export const systemMessageVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 0.7,
    y: 0,
    transition: {
      duration: DURATIONS.medium,
    },
  },
};

/**
 * Typing indicator animation variants.
 */
export const typingIndicatorVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
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
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Typing dot animation variants.
 * Use with staggerChildren for the bounce effect.
 */
export const typingDotContainerVariants: Variants = {
  animate: {
    transition: {
      staggerChildren: 0.15,
      repeat: Infinity,
      repeatDelay: 0.5,
    },
  },
};

export const typingDotVariants: Variants = {
  initial: {
    y: 0,
  },
  animate: {
    y: [-3, 0],
    transition: {
      duration: 0.3,
      repeat: Infinity,
      repeatType: 'reverse',
    },
  },
};

/**
 * Message reaction animation variants.
 */
export const reactionVariants: Variants = {
  hidden: {
    scale: 0,
    opacity: 0,
  },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 500,
      damping: 15,
    },
  },
  tap: {
    scale: 1.3,
    transition: {
      type: 'spring',
      stiffness: 600,
    },
  },
};

/**
 * Chat bubble pop animation for new messages.
 */
export const messageBubblePopVariants: Variants = {
  initial: {
    scale: 0.8,
    opacity: 0,
  },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 20,
    },
  },
};

/**
 * Message highlight animation for emphasis.
 */
export const messageHighlightVariants: Variants = {
  normal: {
    backgroundColor: 'transparent',
  },
  highlighted: {
    backgroundColor: [
      'rgba(255, 215, 0, 0.3)',
      'rgba(255, 215, 0, 0.1)',
      'transparent',
    ],
    transition: {
      duration: DURATIONS.slower,
      times: [0, 0.5, 1],
    },
  },
};
