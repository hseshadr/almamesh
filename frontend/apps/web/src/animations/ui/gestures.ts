import type { PanInfo, MotionValue } from 'framer-motion';
import { useTransform, useSpring, useMotionValue } from 'framer-motion';

/**
 * Common drag constraints for various gesture interactions.
 */
export const DRAG_CONSTRAINTS = {
  /** Horizontal swipe */
  horizontal: { top: 0, bottom: 0, left: -200, right: 200 },
  /** Vertical swipe */
  vertical: { left: 0, right: 0, top: -200, bottom: 200 },
  /** Free drag within bounds */
  bounded: { top: -100, bottom: 100, left: -100, right: 100 },
  /** No constraints (infinite) */
  none: {},
} as const;

/**
 * Drag elastic values for different feels.
 */
export const DRAG_ELASTIC = {
  /** Tight rubber band feel */
  tight: 0.1,
  /** Standard feel */
  normal: 0.2,
  /** Loose, bouncy feel */
  loose: 0.4,
  /** Very bouncy */
  bouncy: 0.6,
} as const;

/**
 * Creates a drag end handler with directional callbacks.
 */
export interface DragDirectionHandlers {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
}

export function createDirectionalDragHandler(
  handlers: DragDirectionHandlers,
  threshold: number = 100
) {
  return (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const { x, y } = info.offset;
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    // Determine primary direction
    if (absX > absY) {
      // Horizontal
      if (x < -threshold && handlers.onLeft) {
        handlers.onLeft();
      } else if (x > threshold && handlers.onRight) {
        handlers.onRight();
      }
    } else {
      // Vertical
      if (y < -threshold && handlers.onUp) {
        handlers.onUp();
      } else if (y > threshold && handlers.onDown) {
        handlers.onDown();
      }
    }
  };
}

/**
 * Hook for creating a spring-based draggable value.
 *
 * @example
 * ```tsx
 * function DraggableCard() {
 *   const { x, springX } = useDragSpring();
 *
 *   return (
 *     <motion.div
 *       style={{ x: springX }}
 *       drag="x"
 *       onDrag={(_, info) => x.set(info.offset.x)}
 *       onDragEnd={() => x.set(0)}
 *     />
 *   );
 * }
 * ```
 */
export function useDragSpring(
  stiffness: number = 400,
  damping: number = 30
): { x: MotionValue<number>; y: MotionValue<number>; springX: MotionValue<number>; springY: MotionValue<number> } {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness, damping });
  const springY = useSpring(y, { stiffness, damping });

  return { x, y, springX, springY };
}

/**
 * Hook for parallax-style motion based on scroll or drag.
 *
 * @param input - The input motion value (e.g., scrollY)
 * @param inputRange - Input value range [start, end]
 * @param outputRange - Output value range [start, end]
 *
 * @example
 * ```tsx
 * function ParallaxLayer() {
 *   const { scrollY } = useScroll();
 *   const y = useParallax(scrollY, [0, 500], [0, -100]);
 *
 *   return <motion.div style={{ y }} />;
 * }
 * ```
 */
export function useParallax(
  input: MotionValue<number>,
  inputRange: [number, number],
  outputRange: [number, number]
): MotionValue<number> {
  return useTransform(input, inputRange, outputRange);
}

/**
 * Hook for rotation based on drag position.
 *
 * @example
 * ```tsx
 * function TiltCard() {
 *   const { x, rotateY } = useTilt();
 *
 *   return (
 *     <motion.div
 *       style={{ x, rotateY }}
 *       drag="x"
 *       dragConstraints={{ left: -100, right: 100 }}
 *     />
 *   );
 * }
 * ```
 */
export function useTilt(
  maxRotation: number = 15
): { x: MotionValue<number>; rotateY: MotionValue<number> } {
  const x = useMotionValue(0);
  const rotateY = useTransform(x, [-200, 200], [-maxRotation, maxRotation]);

  return { x, rotateY };
}

/**
 * Hook for scale based on drag distance.
 */
export function useDragScale(
  maxDistance: number = 100,
  minScale: number = 0.9,
  maxScale: number = 1.1
): { x: MotionValue<number>; y: MotionValue<number>; scale: MotionValue<number> } {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Calculate distance from center
  const scale = useTransform(
    [x, y],
    ([latestX, latestY]: number[]) => {
      const distance = Math.sqrt(latestX ** 2 + latestY ** 2);
      const normalizedDistance = Math.min(distance / maxDistance, 1);
      return minScale + (maxScale - minScale) * normalizedDistance;
    }
  );

  return { x, y, scale };
}
