/**
 * AlmaMesh Animation Architecture
 *
 * Two-library animation system:
 * - Framer Motion (ui/) - React-first declarative animations for UI
 * - GSAP (storytelling/) - Cinematic scroll-driven experiences
 *
 * @example
 * ```tsx
 * // UI animations (Framer Motion)
 * import { pageVariants, modalVariants } from '@/animations/ui';
 *
 * // Storytelling animations (GSAP)
 * import { useGSAP, createHeroTimeline } from '@/animations/storytelling';
 *
 * // Shared constants
 * import { DURATIONS, EASINGS } from '@/animations/constants';
 * ```
 */

// Re-export all modules for convenience
export * from './constants';
export * from './ui';
export * from './storytelling';
