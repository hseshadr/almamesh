/**
 * Planetary Force-Field 3D scene (chart-view centerpiece).
 *
 * Public surface is the typed `ForceFieldExperience` boundary; the scene
 * children stay internal. Lazy-load via `import('./ForceFieldExperience')` to
 * keep three.js out of first paint.
 */

export { ForceFieldExperience } from './ForceFieldExperience';
export type { ForceFieldExperienceProps } from './ForceFieldExperience';
