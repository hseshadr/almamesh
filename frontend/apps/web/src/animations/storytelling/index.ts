/**
 * GSAP storytelling animations barrel export.
 * Import from '@/animations/storytelling' for cinematic animations.
 *
 * @example
 * ```tsx
 * import { useGSAP, createHeroTimeline, createScrollNarrative } from '@/animations/storytelling';
 *
 * // For lazy loading (recommended for bundle optimization):
 * import { useGSAPLazy, preloadGSAP } from '@/animations/storytelling';
 * ```
 */

// Core GSAP hooks and utilities
export {
  useGSAP,
  useScrollAnimation,
  useTimeline,
  refreshScrollTrigger,
  killAllScrollTriggers,
  gsap,
  ScrollTrigger,
} from './useGSAP';

// Lazy loading utilities for bundle optimization
export {
  loadGSAP,
  loadMotionPathPlugin,
  isGSAPLoaded,
  getGSAP,
  getScrollTrigger,
  useGSAPLazy,
  preloadGSAP,
} from './lazyLoad';

// Hero animations
export {
  createHeroTimeline,
  createSimpleHeroTimeline,
  createStarFloatAnimation,
  createTextRevealTimeline,
  type HeroElements,
} from './hero';

// Scroll-driven sequences
export {
  createScrollNarrative,
  createParallax,
  createScrollReveal,
  createStaggeredScrollReveal,
  createHorizontalScroll,
  createScrollProgress,
  type ScrollNarrativeConfig,
  type ParallaxConfig,
} from './scrollSequences';

// Dasha timeline visualizations
export {
  createDashaTimeline,
  createDashaWheel,
  createVerticalDashaTimeline,
  animatePeriodTransition,
  type DashaPeriod,
  type DashaTimelineConfig,
} from './dashaTimeline';

// Planetary orbit animations
export {
  createOrbitAnimation,
  createSimpleOrbitAnimation,
  createSolarSystemAnimation,
  createPlanetGlow,
  animatePlanetToPosition,
  createConjunctionAnimation,
  createOrbitPathDraw,
  type PlanetConfig,
} from './planetaryOrbit';

// Cinematic transitions
export {
  createFadeToBlack,
  createFadeFromBlack,
  createWipeTransition,
  createZoomIn,
  createZoomOut,
  createBlurIn,
  createBlurOut,
  createCrossDissolve,
  createPortalTransition,
  createStarBurstReveal,
  createSharedElementTransition,
} from './transitions';
