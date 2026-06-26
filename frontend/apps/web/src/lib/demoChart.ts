/**
 * Static fixture for the marketing hero — NOT engine output; never used for a
 * real reading.
 *
 * The landing-page hero leads with the app's signature 3D force-field, which the
 * pure store adapter `buildEnergyFrame(chart, 0)` drives from a `SiderealChart`.
 * To render the splash WITHOUT booting the ~38 MB Pyodide engine, the hero feeds
 * the force-field this hand-built, bundled fixture instead of a computed chart.
 *
 * The shape is adapted verbatim from the proven `makeChart()` fixture in
 * `@almamesh/store` `adapters/energy.test.ts` (Jupiter mahadasha / Mars
 * antardasha, distinct per-planet longitudes + dignities), so it is a complete,
 * valid input to both `buildEnergyFrame` and `activeDashaFromChart`.
 *
 * HARD CONSTRAINT: this module pulls ZERO engine runtime into the landing chunk.
 * The only dependency on the engine package is the `import type` below, which is
 * fully erased at build time (no runtime code, cannot boot Pyodide) — it resolves
 * to the engine's pure, runtime-free TYPE barrel (`/types`), per the landing plan.
 */

import type { PlanetPosition, SiderealChart } from '@almamesh/browser/types'

/** Build a planet position with sensible defaults; `overrides` set the distinct values. */
function planet(overrides: Partial<PlanetPosition> & { name: string }): PlanetPosition {
  return {
    longitude: 0,
    latitude: 0,
    distance: 1,
    speed: 1,
    is_retrograde: false,
    sign: 'Aries',
    sign_degrees: 0,
    sign_lord: 'mars',
    nakshatra: 'Ashwini',
    nakshatra_pada: 1,
    nakshatra_lord: 'ketu',
    house: 1,
    dignity: 'neutral',
    is_combust: false,
    combustion_separation_deg: null,
    houses_ruled: [],
    is_yogakaraka: false,
    ...overrides,
  }
}

const PLANETS: Record<string, PlanetPosition> = {
  sun: planet({
    name: 'sun',
    longitude: 100.5,
    is_retrograde: true,
    is_combust: true,
    combustion_separation_deg: 2.1,
    dignity: 'debilitated',
  }),
  moon: planet({ name: 'moon', longitude: 200.0 }),
  mars: planet({ name: 'mars', longitude: 12.0, dignity: 'own_sign' }),
  mercury: planet({ name: 'mercury', longitude: 50.0, dignity: 'exalted' }),
  jupiter: planet({ name: 'jupiter', longitude: 270.0 }),
  venus: planet({ name: 'venus', longitude: 333.0, dignity: 'friendly' }),
  saturn: planet({ name: 'saturn', longitude: 15.0, dignity: 'enemy' }),
  rahu: planet({ name: 'rahu', longitude: 345.0 }),
  ketu: planet({ name: 'ketu', longitude: 165.0 }),
}

/**
 * The bundled demo chart that drives the landing hero's force-field.
 * Static data only — see the file header. Never feed this to a real reading.
 */
export const DEMO_CHART: SiderealChart = {
  ayanamsa_value: 23.5,
  lagna: {
    longitude: 65.4,
    sign: 'Gemini',
    sign_degrees: 5.4,
    sign_lord: 'mercury',
    nakshatra: 'Mrigashira',
    nakshatra_pada: 3,
    nakshatra_lord: 'mars',
  },
  planets: PLANETS,
  houses: {},
  dashas: {
    maha_dasha_sequence: [],
    current_maha: {
      lord: 'jupiter',
      start_date: '2020-01-01',
      end_date: '2036-01-01',
      duration_years: 16,
    },
    current_antar: {
      lord: 'mars',
      start_date: '2024-01-01',
      end_date: '2025-01-01',
      duration_years: 1,
    },
    current_pratyantar: null,
  },
  yogas: [],
  navamsa: null,
}
