import type { Variants } from 'framer-motion';
import { DURATIONS } from '../constants';

/**
 * Layout ID generators for shared element transitions.
 * Use these to create consistent IDs across components.
 *
 * @example
 * ```tsx
 * // In ChartCard.tsx
 * <motion.div layoutId={LAYOUT_IDS.chartPreview(chartId)}>
 *   <ChartThumbnail />
 * </motion.div>
 *
 * // In ChartDetail.tsx
 * <motion.div layoutId={LAYOUT_IDS.chartPreview(chartId)}>
 *   <FullChart />
 * </motion.div>
 * ```
 */
export const LAYOUT_IDS = {
  /** Chart preview to full chart transition */
  chartPreview: (chartId: string) => `chart-preview-${chartId}`,
  /** Chart full view */
  chartFull: (chartId: string) => `chart-full-${chartId}`,
  /** Small avatar to large avatar */
  avatarSmall: (userId: string) => `avatar-small-${userId}`,
  /** Large avatar */
  avatarLarge: (userId: string) => `avatar-large-${userId}`,
  /** Card to modal transition */
  cardToModal: (cardId: string) => `card-modal-${cardId}`,
  /** Profile card to profile page */
  profileCard: (profileId: string) => `profile-card-${profileId}`,
  /** Thumbnail to hero image */
  heroImage: (imageId: string) => `hero-image-${imageId}`,
  /** Nav item to page header */
  navItem: (navId: string) => `nav-item-${navId}`,
} as const;

/**
 * Layout transition configuration for shared elements.
 */
export const sharedLayoutTransition = {
  type: 'spring',
  stiffness: 350,
  damping: 35,
} as const;

/**
 * Smooth layout transition for gentler animations.
 */
export const smoothLayoutTransition = {
  type: 'spring',
  stiffness: 200,
  damping: 30,
} as const;

/**
 * Quick layout transition for snappy animations.
 */
export const quickLayoutTransition = {
  type: 'spring',
  stiffness: 500,
  damping: 35,
} as const;

/**
 * Fade variants for elements that only fade (no movement).
 */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: DURATIONS.medium },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATIONS.fast },
  },
};

/**
 * Scale fade variants for elements that scale and fade.
 */
export const scaleFadeVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: DURATIONS.fast },
  },
};

/**
 * Slide up and fade variants.
 */
export const slideUpFadeVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: DURATIONS.fast },
  },
};

/**
 * Slide down and fade variants.
 */
export const slideDownFadeVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: { duration: DURATIONS.fast },
  },
};

/**
 * Popover variants - scale from origin point.
 */
export const popoverVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: -10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    transition: { duration: DURATIONS.fast },
  },
};

/**
 * Tooltip variants - subtle and quick.
 */
export const tooltipVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 5,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: DURATIONS.fast,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: DURATIONS.instant },
  },
};

/**
 * Focus ring animation variants.
 */
export const focusRingVariants: Variants = {
  unfocused: {
    boxShadow: '0 0 0 0 transparent',
  },
  focused: {
    boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.5)',
    transition: {
      duration: DURATIONS.fast,
    },
  },
};
