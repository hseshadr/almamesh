import type { Variants, PanInfo } from 'framer-motion';
import { DURATIONS } from '../constants';

/**
 * Overlay backdrop variants for modals and sheets.
 */
export const overlayVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: DURATIONS.fast,
    },
  },
};

/**
 * Standard modal variants - scale + fade entrance.
 *
 * @example
 * ```tsx
 * <AnimatePresence>
 *   {isOpen && (
 *     <motion.div
 *       variants={modalVariants}
 *       initial="hidden"
 *       animate="visible"
 *       exit="hidden"
 *     >
 *       {content}
 *     </motion.div>
 *   )}
 * </AnimatePresence>
 * ```
 */
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
};

/**
 * Bottom sheet variants - slides up from bottom.
 * Combine with drag for swipe-to-dismiss.
 */
export const bottomSheetVariants: Variants = {
  hidden: {
    y: '100%',
  },
  visible: {
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
};

/**
 * Side sheet variants - slides in from right.
 */
export const sideSheetVariants: Variants = {
  hidden: {
    x: '100%',
  },
  visible: {
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
};

/**
 * Left drawer variants - slides in from left.
 */
export const leftDrawerVariants: Variants = {
  hidden: {
    x: '-100%',
  },
  visible: {
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    },
  },
};

/**
 * Creates a drag-to-dismiss handler for bottom sheets.
 *
 * @param onClose - Function to call when sheet should close
 * @param threshold - Drag distance in pixels to trigger close (default: 100)
 *
 * @example
 * ```tsx
 * const handleDragEnd = createSheetDragHandler(onClose, 100);
 *
 * <motion.div
 *   drag="y"
 *   dragConstraints={{ top: 0 }}
 *   dragElastic={0.2}
 *   onDragEnd={handleDragEnd}
 * >
 *   Sheet content
 * </motion.div>
 * ```
 */
export function createSheetDragHandler(
  onClose: () => void,
  threshold: number = 100
) {
  return (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.y > threshold) {
      onClose();
    }
  };
}

/**
 * Creates a drag-to-dismiss handler for side sheets.
 */
export function createSideSheetDragHandler(
  onClose: () => void,
  threshold: number = 100
) {
  return (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.x > threshold) {
      onClose();
    }
  };
}
