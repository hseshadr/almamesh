/**
 * Shared planet placement math for the force-field scene.
 *
 * Single source of truth for "where does a planet sit" so `PlanetMesh` and
 * `WaveBeam` never drift. Fully typed (no `@ts-nocheck`): this is pure math, no
 * R3F JSX.
 *
 * Default placement = REAL sidereal ecliptic longitude (astrologer-grade): the
 * azimuth is the planet's true longitude, the radius is an aesthetic per-planet
 * shell so conjunct glyphs read as same-azimuth / different-shell. The legacy
 * aesthetic-orbit mode (phase + t·speed) is kept for reduced-motion idle drift.
 */

import type { PlanetWave } from '@almamesh/shared-types';

/** Y offset of the scene centre (the native core sits slightly above ground). */
export const CENTER_Y = 0.4;

export interface PlanetPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly angle: number;
}

/**
 * Compute a planet's world position at wave-clock `time`.
 *
 * @param useRealLongitude When true (default) the azimuth is the planet's true
 *   ecliptic longitude (static, legible). When false the planet drifts on its
 *   aesthetic orbit (`phase + time·orbitSpeed`).
 */
export function planetPosition(
  planet: PlanetWave,
  time: number,
  useRealLongitude = true,
): PlanetPlacement {
  // Zodiac runs counter-clockwise; align 0deg Aries with +X.
  const angle = useRealLongitude
    ? (-planet.eclipticLongitude * Math.PI) / 180
    : planet.phase + time * planet.orbitSpeed;

  const x = Math.cos(angle) * planet.orbitRadius;
  const z = Math.sin(angle) * planet.orbitRadius;
  // Subtle vertical bob only in aesthetic-orbit mode; flat for the real wheel.
  const y = useRealLongitude ? 0 : Math.sin(time * 0.3) * 0.2;
  return { x, y, z, angle };
}
