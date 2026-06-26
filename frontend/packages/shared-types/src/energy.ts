/**
 * Energy Types for the Planetary Force-Field Visualization
 *
 * Pure-data contract for the 3D planetary wave-interference scene. The store
 * adapter (`@almamesh/store` `buildEnergyFrame`) turns a `SiderealChart` into an
 * `EnergyFrame`; the 3D scene consumes `EnergyFrame` only — NO astrology lives
 * in the renderer.
 *
 * Planet keys are LOWERCASE (`sun`..`ketu`), matching the engine's serialized
 * enum values, so no titleCase bridging is needed anywhere downstream.
 *
 * @packageDocumentation
 */

/**
 * Canonical planet identifier — lowercase, matching the engine's serialized
 * enum values and `SiderealChart.planets` keys.
 */
export type PlanetName =
  | 'sun'
  | 'moon'
  | 'mars'
  | 'mercury'
  | 'jupiter'
  | 'venus'
  | 'saturn'
  | 'rahu'
  | 'ketu';

/**
 * RGB color tuple in 0-1 range (shader-ready).
 */
export type RGBColor = [number, number, number];

// ============================================================================
// Planet Wave Types
// ============================================================================

/**
 * Represents a single planet's wave contribution to the force field.
 *
 * Each planet emits a wave characterized by:
 * - Amplitude: influenced by natal strength and dasha activation
 * - Frequency: aesthetic constant per planet
 * - Coherence: how well aligned with the active dasha lord
 * - Phase shift: derived from the friendship relationship
 */
export interface PlanetWave {
  /** Planet identifier (lowercase, e.g. 'sun', 'moon') */
  id: PlanetName;
  /** Visual orbit radius for rendering (aesthetic shell) */
  orbitRadius: number;
  /** Visual orbit animation speed (aesthetic-mode drift) */
  orbitSpeed: number;
  /** Base phase in radians (seeded from ecliptic longitude) */
  phase: number;
  /** Wave frequency (aesthetic) */
  frequency: number;
  /** Wave amplitude from strength calculation (0.05 - 1.2) */
  amplitude: number;
  /** Coherence with active dasha lord (0=opposed, 1=aligned) */
  coherence: number;
  /** Friendship weight: +1=friend, 0.25=neutral, -1=enemy */
  friendlinessToActive: number;
  /** Phase shift derived from friendliness (radians) */
  phaseShift: number;
  /** RGB color (0-1 range) */
  waveColor: RGBColor;
  /** True sidereal ecliptic longitude (degrees, 0-360) — drives scene azimuth */
  eclipticLongitude: number;
  /** Retrograde motion — visual cue (reversed beam flow) */
  isRetrograde?: boolean;
  /** Combust (too close to the Sun) — visual cue (desaturated glyph) */
  isCombust?: boolean;
}

// ============================================================================
// Aura State Types
// ============================================================================

/**
 * The computed aggregate force-field state at a specific wave-clock moment.
 *
 * Derived from the net interference of all planetary waves.
 */
export interface AuraState {
  /** Aura radius (1.0 = neutral, <1 = compressed, >1 = expanded) */
  baseRadius: number;
  /** Glow intensity (0 = dim, 1 = bright) */
  glow: number;
  /** Mean coherence across all planets (0 - 1) */
  stability: number;
  /** Net energy flux (positive = constructive, negative = destructive) */
  netFlux: number;
  /** RGB color based on net flux */
  color: RGBColor;
}

// ============================================================================
// Active Dasha Types
// ============================================================================

/**
 * The currently active dasha lords (already resolved by the engine for the
 * pinned reference date).
 */
export interface ActiveDasha {
  /** Mahadasha lord */
  maha: PlanetName;
  /** Antardasha lord (optional) */
  antar: PlanetName | null;
}

// ============================================================================
// Energy Frame Types
// ============================================================================

/**
 * Complete force-field state snapshot at wave-clock time `t`.
 */
export interface EnergyFrame {
  /** Wave-clock time for this frame (seconds, animation clock) */
  t: number;
  /** Active dasha lords */
  active: ActiveDasha;
  /** Computed aggregate aura state */
  aura: AuraState;
  /** Per-planet wave data (all 9 grahas) */
  planets: PlanetWave[];
}

// ============================================================================
// Constants - Planet Visual Properties (lowercase keys, sun..ketu)
// ============================================================================

/**
 * Planet wave frequency table (aesthetic values from spec).
 */
export const PLANET_FREQUENCIES: Record<PlanetName, number> = {
  sun: 1.6,
  moon: 1.0,
  mars: 1.8,
  mercury: 2.2,
  jupiter: 0.9,
  venus: 1.2,
  saturn: 0.7,
  rahu: 2.6,
  ketu: 2.4,
};

/**
 * Planet wave colors (RGB 0-1, shader-ready). These are the canonical
 * `@almamesh/constants` `colors.planets` hex tokens converted to the 0-1 GLSL
 * range — the SAME observatory brass/lapis palette the SVG kundli uses, so the
 * 3D scene reads as muted antique-astrolabe instead of saturated primary RGB.
 *
 * Kept as a literal table (rather than importing `@almamesh/constants`) so this
 * foundational types package stays dependency-free; the values are mirrored
 * from `colors.planets` and locked by the energy-adapter test. If the brass
 * tokens move, update both in lockstep.
 */
export const PLANET_WAVE_COLORS: Record<PlanetName, RGBColor> = {
  sun: [0.8902, 0.7216, 0.3529], // #E3B85A brass-gold
  moon: [0.8471, 0.8314, 0.7765], // #D8D4C6 silver-ivory
  mars: [0.7843, 0.2902, 0.2275], // #C84A3A oxide red
  mercury: [0.3725, 0.6588, 0.5412], // #5FA88A verdigris
  jupiter: [0.851, 0.6353, 0.2314], // #D9A23B amber-gold
  venus: [0.7882, 0.5412, 0.6588], // #C98AA8 rose-quartz
  saturn: [0.2275, 0.3098, 0.6902], // #3A4FB0 lapis
  rahu: [0.4784, 0.4941, 0.549], // #7A7E8C slate
  ketu: [0.3608, 0.3725, 0.4196], // #5C5F6B deep slate
};

/**
 * Planet orbit radii (visual shells).
 */
export const PLANET_ORBIT_RADII: Record<PlanetName, number> = {
  sun: 3.5,
  moon: 4.0,
  mars: 4.5,
  mercury: 5.0,
  jupiter: 5.5,
  venus: 6.0,
  saturn: 6.5,
  rahu: 7.0,
  ketu: 7.5,
};

/**
 * Planet orbit speeds (visual idle-drift animation).
 */
export const PLANET_ORBIT_SPEEDS: Record<PlanetName, number> = {
  sun: 0.08,
  moon: 0.15,
  mars: 0.1,
  mercury: 0.2,
  jupiter: 0.06,
  venus: 0.12,
  saturn: 0.05,
  rahu: 0.07,
  ketu: 0.07,
};
