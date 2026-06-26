/**
 * Pure adapter: `SiderealChart` → `EnergyFrame`.
 *
 * Presentation math only — turns the engine's resolved chart into the
 * wave-interference parameters the 3D force-field scene consumes. This is NOT
 * astrology engine math (it does not affect the Pyodide==CPython byte-parity
 * gate); the formulas are aesthetic/heuristic, ported from the esoteric
 * `energy_model_service.py` BPHS friendship model.
 *
 * Sibling of `adapters/chart.ts`. Fully typed, no `any`, no default export.
 */

import type { PlanetPosition, SiderealChart } from "@almamesh/browser/types";
import {
  PLANET_FREQUENCIES,
  PLANET_ORBIT_RADII,
  PLANET_ORBIT_SPEEDS,
  PLANET_WAVE_COLORS,
  type ActiveDasha,
  type AuraState,
  type EnergyFrame,
  type PlanetName,
  type PlanetWave,
} from "@almamesh/shared-types";

// --- BPHS friendship matrix (ported from _get_default_friendship_matrix) ----

interface Relations {
  readonly friends: readonly PlanetName[];
  readonly enemies: readonly PlanetName[];
  readonly neutrals: readonly PlanetName[];
}

const FRIENDSHIP: Readonly<Record<PlanetName, Relations>> = {
  sun: { friends: ["moon", "mars", "jupiter"], enemies: ["venus", "saturn"], neutrals: ["mercury"] },
  moon: { friends: ["sun", "mercury"], enemies: [], neutrals: ["mars", "jupiter", "venus", "saturn"] },
  mars: { friends: ["sun", "moon", "jupiter"], enemies: ["mercury"], neutrals: ["venus", "saturn"] },
  mercury: { friends: ["sun", "venus"], enemies: ["moon"], neutrals: ["mars", "jupiter", "saturn"] },
  jupiter: { friends: ["sun", "moon", "mars"], enemies: ["mercury", "venus"], neutrals: ["saturn"] },
  venus: { friends: ["mercury", "saturn"], enemies: ["sun", "moon"], neutrals: ["mars", "jupiter"] },
  saturn: { friends: ["mercury", "venus"], enemies: ["sun", "moon", "mars"], neutrals: ["jupiter"] },
  // Rahu/Ketu are treated Saturn-like (see `norm`); entries kept for total typing.
  rahu: { friends: ["mercury", "venus"], enemies: ["sun", "moon", "mars"], neutrals: ["jupiter"] },
  ketu: { friends: ["mercury", "venus"], enemies: ["sun", "moon", "mars"], neutrals: ["jupiter"] },
};

const FRIEND_W = 1.0;
const NEUTRAL_W = 0.25;
const ENEMY_W = -1.0;
const MAHA_BOOST = 1.55;
const ANTAR_BOOST = 1.25;

const PLANETS: readonly PlanetName[] = [
  "sun",
  "moon",
  "mars",
  "mercury",
  "jupiter",
  "venus",
  "saturn",
  "rahu",
  "ketu",
];

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Rahu/Ketu behave Saturn-like in the friendship model. */
const norm = (p: PlanetName): PlanetName =>
  p === "rahu" || p === "ketu" ? "saturn" : p;

/** Friendship weight of `planet` relative to the active dasha lord. */
export function friendshipWeight(
  planet: PlanetName,
  activeLord: PlanetName,
): number {
  const rel = FRIENDSHIP[norm(activeLord)];
  const key = norm(planet);
  if (rel.friends.includes(key)) return FRIEND_W;
  if (rel.enemies.includes(key)) return ENEMY_W;
  return NEUTRAL_W;
}

/** coherence = clamp(0.5 + 0.4*friendliness, 0.05, 0.95) */
const coherenceOf = (f: number): number => clamp(0.5 + 0.4 * f, 0.05, 0.95);

/** phase_shift = pi*(1 - coherence) */
const phaseShiftOf = (c: number): number => Math.PI * (1 - c);

/** amplitude = clamp(natal * boost, 0.05, 1.2); ×1.55 maha lord, ×1.25 antar lord */
function amplitudeOf(
  planet: PlanetName,
  maha: PlanetName,
  antar: PlanetName | null,
  natal: number,
): number {
  let boost = 1.0;
  if (planet === maha) boost *= MAHA_BOOST;
  if (antar && planet === antar) boost *= ANTAR_BOOST;
  return clamp(natal * boost, 0.05, 1.2);
}

/** Aesthetic base weight per engine dignity (exalted .9 … debilitated .2). */
function dignityBase(dignity: string): number {
  const d = dignity.toLowerCase();
  if (d.includes("exalt")) return 0.9;
  if (d.includes("own")) return 0.75;
  if (d.includes("debil")) return 0.2;
  if (d.includes("friend")) return 0.6;
  if (d.includes("enemy")) return 0.35;
  return 0.5;
}

/** Yogakaraka lift / combustion damping applied to the dignity base. */
const YOGAKARAKA_LIFT = 0.15;
const COMBUSTION_DAMP = 0.15;

/**
 * natal_strength: a purely AESTHETIC weight derived from the engine's REAL
 * qualitative natal flags — dignity base, +0.15 yogakaraka lift, −0.15
 * combustion damping — clamped [0.1, 1.0]; 0.5 when the planet is absent.
 * (The old numeric per-planet `shadbala` stub was removed from the natal
 * contract; real Shadbala lives only in the lazy predictive strength_context,
 * which this visual never reads.)
 */
function natalStrength(pos: PlanetPosition | undefined): number {
  if (!pos) return 0.5;
  let strength = dignityBase(pos.dignity);
  if (pos.is_yogakaraka) strength += YOGAKARAKA_LIFT;
  if (pos.is_combust) strength -= COMBUSTION_DAMP;
  return clamp(strength, 0.1, 1.0);
}

/** net_flux(t) = Σ A·coh·cos(freq·t + phase + shift) / (n·0.6), clamped [-2,2] */
function netFlux(planets: readonly PlanetWave[], t: number): number {
  if (planets.length === 0) return 0;
  const total = planets.reduce(
    (s, p) =>
      s + p.amplitude * p.coherence * Math.cos(p.frequency * t + p.phase + p.phaseShift),
    0,
  );
  return clamp(total / (planets.length * 0.6), -2, 2);
}

/** Pure aura aggregate at wave-clock time `t` (exported for the HUD / tests). */
export function computeAuraState(
  planets: readonly PlanetWave[],
  t: number,
): AuraState {
  const nf = netFlux(planets, t);
  const glow = 1 / (1 + Math.exp(-2.5 * nf));
  const baseRadius = clamp(1.1 + 0.35 * nf, 0.75, 1.55);
  const stability = planets.length
    ? planets.reduce((s, p) => s + p.coherence, 0) / planets.length
    : 0.5;
  // Aura hue from the observatory tokens: constructive flux glows lapis-blue
  // (#5468C8 lifted), destructive glows oxide-red (#C84A3A).
  const color: [number, number, number] =
    nf >= 0 ? [0.42, 0.52, 0.85] : [0.78, 0.34, 0.27];
  return { baseRadius, glow, stability, netFlux: nf, color };
}

/** The dasha lords active in the persisted chart (engine already resolved them). */
export function activeDashaFromChart(chart: SiderealChart): ActiveDasha {
  const maha = (chart.dashas.current_maha?.lord ?? "sun") as PlanetName;
  const antar = (chart.dashas.current_antar?.lord ?? null) as PlanetName | null;
  return { maha, antar };
}

/** Build one energy frame from the local chart at wave-time `t` (seconds). */
export function buildEnergyFrame(chart: SiderealChart, t: number): EnergyFrame {
  const active = activeDashaFromChart(chart);
  const planets: PlanetWave[] = PLANETS.map((id) => {
    const pos = chart.planets[id];
    const friendlinessToActive = friendshipWeight(id, active.maha);
    const coherence = coherenceOf(friendlinessToActive);
    const phaseShift = phaseShiftOf(coherence);
    const amplitude = amplitudeOf(id, active.maha, active.antar, natalStrength(pos));
    const eclipticLongitude = pos?.longitude ?? 0;
    return {
      id,
      friendlinessToActive,
      coherence,
      phaseShift,
      amplitude,
      frequency: PLANET_FREQUENCIES[id],
      orbitRadius: PLANET_ORBIT_RADII[id],
      orbitSpeed: PLANET_ORBIT_SPEEDS[id],
      // Seed phase from longitude; eclipticLongitude carries the real angle.
      phase: (eclipticLongitude * Math.PI) / 180,
      eclipticLongitude,
      waveColor: PLANET_WAVE_COLORS[id],
      isRetrograde: pos?.is_retrograde ?? false,
      isCombust: pos?.is_combust ?? false,
    };
  });
  return { t, active, aura: computeAuraState(planets, t), planets };
}
