import type { Variants } from 'framer-motion';
import { DURATIONS } from '../constants';

/**
 * List container variants for staggered item entrance.
 */
export const listContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

/**
 * List item entrance variants.
 */
export const listItemVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * List item slide from right variants.
 */
export const listItemSlideRightVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * List item fade up variants.
 */
export const listItemFadeUpVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 15,
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
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Reorder item variants for drag-to-reorder lists.
 * Use with Framer Motion's Reorder component.
 *
 * @example
 * ```tsx
 * import { Reorder } from 'framer-motion';
 * import { reorderItemVariants } from '@/animations/ui';
 *
 * <Reorder.Group values={items} onReorder={setItems}>
 *   {items.map((item) => (
 *     <Reorder.Item
 *       key={item.id}
 *       value={item}
 *       variants={reorderItemVariants}
 *       initial="initial"
 *       animate="animate"
 *       whileDrag="dragging"
 *     >
 *       {item.content}
 *     </Reorder.Item>
 *   ))}
 * </Reorder.Group>
 * ```
 */
export const reorderItemVariants: Variants = {
  initial: {
    opacity: 0,
    y: 10,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 35,
    },
  },
  dragging: {
    scale: 1.02,
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
    cursor: 'grabbing',
    zIndex: 10,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Collapse/expand variants for accordion-like lists.
 */
export const collapseVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: {
      height: {
        duration: DURATIONS.medium,
      },
      opacity: {
        duration: DURATIONS.fast,
      },
    },
  },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: {
        duration: DURATIONS.medium,
      },
      opacity: {
        duration: DURATIONS.medium,
        delay: 0.1,
      },
    },
  },
};

/**
 * Empty state animation variants.
 */
export const emptyStateVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      delay: 0.2,
      duration: DURATIONS.medium,
      ease: 'easeOut',
    },
  },
};
