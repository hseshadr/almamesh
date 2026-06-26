/**
 * Animation duration constants used across the application.
 * These values provide consistent timing for all animations.
 */
export const DURATIONS = {
  /** Micro-interactions - 100ms */
  instant: 0.1,
  /** Quick feedback - 200ms */
  fast: 0.2,
  /** Standard transitions - 350ms */
  medium: 0.35,
  /** Emphasis moments - 500ms */
  slow: 0.5,
  /** Dramatic reveals - 800ms */
  slower: 0.8,
  /** Cinematic moments - 1200ms */
  slowest: 1.2,
} as const;

export type DurationKey = keyof typeof DURATIONS;
export type DurationValue = (typeof DURATIONS)[DurationKey];
