import { describe, expect, it } from "vitest";

import type { PlanetPosition, SiderealChart } from "@almamesh/browser/types";
import {
  PLANET_FREQUENCIES,
  PLANET_ORBIT_RADII,
  PLANET_ORBIT_SPEEDS,
  PLANET_WAVE_COLORS,
  type PlanetName,
  type PlanetWave,
} from "@almamesh/shared-types";

import {
  activeDashaFromChart,
  buildEnergyFrame,
  computeAuraState,
  friendshipWeight,
} from "./energy";

// --- Hand-built fixture (mirrors adapters/chartGeometry.test.ts) ------------

function planet(
  overrides: Partial<PlanetPosition> & { name: string },
): PlanetPosition {
  return {
    longitude: 0,
    latitude: 0,
    distance: 1,
    speed: 1,
    is_retrograde: false,
    sign: "Aries",
    sign_degrees: 0,
    sign_lord: "mars",
    nakshatra: "Ashwini",
    nakshatra_pada: 1,
    nakshatra_lord: "ketu",
    house: 1,
    dignity: "neutral",
    is_combust: false,
    combustion_separation_deg: null,
    houses_ruled: [],
    is_yogakaraka: false,
    ...overrides,
  };
}

const ALL_PLANETS: readonly PlanetName[] = [
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

// Jupiter mahadasha, Mars antardasha. Distinct longitudes / qualitative flags
// (dignity / combustion / yogakaraka — the engine's REAL natal signals) so the
// passthrough and boost assertions are unambiguous.
function makeChart(over: Partial<SiderealChart> = {}): SiderealChart {
  const planets: Record<string, PlanetPosition> = {};
  for (const id of ALL_PLANETS) {
    planets[id] = planet({ name: id });
  }
  // Per-planet distinct positions / strengths.
  planets.sun = planet({
    name: "sun",
    longitude: 100.5,
    is_retrograde: true,
    is_combust: true,
    combustion_separation_deg: 2.1,
    dignity: "debilitated",
  });
  planets.moon = planet({ name: "moon", longitude: 200.0 }); // neutral -> 0.5
  planets.mars = planet({ name: "mars", longitude: 12.0, dignity: "own_sign" });
  planets.jupiter = planet({
    name: "jupiter",
    longitude: 270.0, // neutral dignity -> natalStrength 0.5
  });
  planets.mercury = planet({ name: "mercury", longitude: 50.0, dignity: "exalted" });
  planets.venus = planet({ name: "venus", longitude: 333.0, dignity: "friendly" });
  planets.saturn = planet({ name: "saturn", longitude: 15.0, dignity: "enemy" });
  planets.rahu = planet({ name: "rahu", longitude: 345.0 });
  planets.ketu = planet({ name: "ketu", longitude: 165.0 });

  return {
    ayanamsa_value: 23.5,
    lagna: {
      longitude: 65.4,
      sign: "Gemini",
      sign_degrees: 5.4,
      sign_lord: "mercury",
      nakshatra: "Mrigashira",
      nakshatra_pada: 3,
      nakshatra_lord: "mars",
    },
    planets,
    houses: {},
    dashas: {
      maha_dasha_sequence: [],
      current_maha: {
        lord: "jupiter",
        start_date: "2020-01-01",
        end_date: "2036-01-01",
        duration_years: 16,
      },
      current_antar: {
        lord: "mars",
        start_date: "2024-01-01",
        end_date: "2025-01-01",
        duration_years: 1,
      },
      current_pratyantar: null,
    },
    yogas: [],
    navamsa: null,
    ...over,
  };
}

// ============================================================================
// friendshipWeight (BPHS matrix)
// ============================================================================

describe("friendshipWeight", () => {
  it("returns +1 for a friend of the active lord", () => {
    // Jupiter's friends: sun, moon, mars
    expect(friendshipWeight("sun", "jupiter")).toBe(1.0);
    expect(friendshipWeight("mars", "jupiter")).toBe(1.0);
  });

  it("returns -1 for an enemy of the active lord", () => {
    // Jupiter's enemies: mercury, venus
    expect(friendshipWeight("mercury", "jupiter")).toBe(-1.0);
    expect(friendshipWeight("venus", "jupiter")).toBe(-1.0);
  });

  it("returns 0.25 for a neutral of the active lord", () => {
    // Jupiter's neutral: saturn
    expect(friendshipWeight("saturn", "jupiter")).toBe(0.25);
  });

  it("treats Rahu/Ketu as Saturn-like (both as planet and as active lord)", () => {
    // As planet: saturn is neutral to jupiter, so rahu/ketu also neutral.
    expect(friendshipWeight("rahu", "jupiter")).toBe(
      friendshipWeight("saturn", "jupiter"),
    );
    expect(friendshipWeight("ketu", "jupiter")).toBe(
      friendshipWeight("saturn", "jupiter"),
    );
    // As active lord: rahu lord behaves like saturn lord.
    expect(friendshipWeight("mercury", "rahu")).toBe(
      friendshipWeight("mercury", "saturn"),
    );
    expect(friendshipWeight("sun", "ketu")).toBe(
      friendshipWeight("sun", "saturn"),
    );
    // Saturn's friends include venus/mercury -> +1 from rahu lord.
    expect(friendshipWeight("venus", "rahu")).toBe(1.0);
    // Saturn's enemies include sun -> -1 from ketu lord.
    expect(friendshipWeight("sun", "ketu")).toBe(-1.0);
  });
});

// ============================================================================
// buildEnergyFrame
// ============================================================================

describe("buildEnergyFrame", () => {
  const chart = makeChart();
  const frame = buildEnergyFrame(chart, 0);

  it("includes all 9 planets in the frame", () => {
    expect(frame.planets).toHaveLength(9);
    const ids = frame.planets.map((p) => p.id).sort();
    expect(ids).toEqual([...ALL_PLANETS].sort());
  });

  it("carries the frame wave-clock time", () => {
    expect(buildEnergyFrame(chart, 3.5).t).toBe(3.5);
  });

  it("resolves active dasha lords from the chart", () => {
    expect(frame.active.maha).toBe("jupiter");
    expect(frame.active.antar).toBe("mars");
  });

  it("passes the real ecliptic longitude through unchanged", () => {
    const sun = frame.planets.find((p) => p.id === "sun") as PlanetWave;
    expect(sun.eclipticLongitude).toBe(100.5);
    const ketu = frame.planets.find((p) => p.id === "ketu") as PlanetWave;
    expect(ketu.eclipticLongitude).toBe(165.0);
  });

  it("seeds phase (radians) from the ecliptic longitude", () => {
    const sun = frame.planets.find((p) => p.id === "sun") as PlanetWave;
    expect(sun.phase).toBeCloseTo((100.5 * Math.PI) / 180, 10);
  });

  it("pulls aesthetic params from the lowercase constant tables", () => {
    const mars = frame.planets.find((p) => p.id === "mars") as PlanetWave;
    expect(mars.frequency).toBe(PLANET_FREQUENCIES.mars);
    expect(mars.orbitRadius).toBe(PLANET_ORBIT_RADII.mars);
    expect(mars.orbitSpeed).toBe(PLANET_ORBIT_SPEEDS.mars);
    expect(mars.waveColor).toEqual(PLANET_WAVE_COLORS.mars);
  });

  it("propagates retrograde / combust visual flags", () => {
    const sun = frame.planets.find((p) => p.id === "sun") as PlanetWave;
    expect(sun.isRetrograde).toBe(true);
    expect(sun.isCombust).toBe(true);
    const moon = frame.planets.find((p) => p.id === "moon") as PlanetWave;
    expect(moon.isRetrograde).toBe(false);
    expect(moon.isCombust).toBe(false);
  });

  it("clamps coherence into [0.05, 0.95]", () => {
    for (const p of frame.planets) {
      expect(p.coherence).toBeGreaterThanOrEqual(0.05);
      expect(p.coherence).toBeLessThanOrEqual(0.95);
    }
  });

  it("derives phaseShift = pi*(1 - coherence) and clamps it", () => {
    for (const p of frame.planets) {
      expect(p.phaseShift).toBeCloseTo(Math.PI * (1 - p.coherence), 10);
      expect(p.phaseShift).toBeGreaterThanOrEqual(0);
      expect(p.phaseShift).toBeLessThanOrEqual(Math.PI);
    }
  });

  it("clamps amplitude into [0.05, 1.2]", () => {
    for (const p of frame.planets) {
      expect(p.amplitude).toBeGreaterThanOrEqual(0.05);
      expect(p.amplitude).toBeLessThanOrEqual(1.2);
    }
  });

  it("boosts the maha-lord amplitude above a non-lord of equal natal strength", () => {
    // jupiter (maha lord) and venus both carry neutral dignity -> natal 0.5.
    // Use equal natal via dedicated chart so only the boost differs.
    const eq = makeChart();
    // 'venus' is not maha (jupiter) nor antar (mars); neutral dignity -> 0.5.
    eq.planets.venus = planet({ name: "venus", longitude: 333, dignity: "neutral" });
    const f = buildEnergyFrame(eq, 0);
    const jup = f.planets.find((p) => p.id === "jupiter") as PlanetWave;
    const ven = f.planets.find((p) => p.id === "venus") as PlanetWave;
    // Same base natal (0.5) but jupiter gets the maha ×1.55 boost.
    expect(jup.amplitude).toBeGreaterThan(ven.amplitude);
    expect(jup.amplitude).toBeCloseTo(0.5 * 1.55, 10);
    expect(ven.amplitude).toBeCloseTo(0.5, 10);
  });

  it("boosts the antar-lord amplitude (×1.25)", () => {
    // mars is antar lord, dignity own_sign -> natal 0.75; boost ×1.25 = 0.9375.
    const mars = frame.planets.find((p) => p.id === "mars") as PlanetWave;
    expect(mars.amplitude).toBeCloseTo(0.75 * 1.25, 10);
  });
});

// ============================================================================
// natalStrength (via amplitude, isolating boost=1 planets)
// ============================================================================

describe("natalStrength (observed via amplitude on non-lord planets)", () => {
  it("derives the base strength from the engine's dignity", () => {
    const chart = makeChart();
    // mercury: exalted -> 0.9. mercury is enemy of jupiter (no dasha boost).
    const f = buildEnergyFrame(chart, 0);
    const merc = f.planets.find((p) => p.id === "mercury") as PlanetWave;
    expect(merc.amplitude).toBeCloseTo(0.9, 10);
    // moon: neutral -> 0.5 (friend of jupiter, no boost).
    const moon = f.planets.find((p) => p.id === "moon") as PlanetWave;
    expect(moon.amplitude).toBeCloseTo(0.5, 10);
  });

  it("damps a combust planet (-0.15) and clamps the floor at 0.1", () => {
    // sun: debilitated (0.2) AND combust (-0.15) -> 0.05, clamped up to 0.1.
    const chart = makeChart();
    const f = buildEnergyFrame(chart, 0);
    const sun = f.planets.find((p) => p.id === "sun") as PlanetWave;
    // sun is friend of jupiter -> boost 1.0 (not maha/antar). amplitude == natal.
    expect(sun.amplitude).toBeCloseTo(0.1, 10);
  });

  it("lifts the engine-flagged yogakaraka (+0.15)", () => {
    const chart = makeChart();
    // venus: neutral (0.5) + yogakaraka lift (0.15) = 0.65. Venus is neither
    // maha (jupiter) nor antar (mars), so amplitude == natal strength.
    chart.planets.venus = planet({
      name: "venus",
      longitude: 333,
      dignity: "neutral",
      is_yogakaraka: true,
    });
    const f = buildEnergyFrame(chart, 0);
    const ven = f.planets.find((p) => p.id === "venus") as PlanetWave;
    expect(ven.amplitude).toBeCloseTo(0.65, 10);
  });

  it("defaults to 0.5 when the planet is missing from the chart", () => {
    const chart = makeChart();
    const sparse: SiderealChart = {
      ...chart,
      planets: {}, // no planets at all
    };
    const f = buildEnergyFrame(sparse, 0);
    // jupiter is maha lord: 0.5 * 1.55 = 0.775
    const jup = f.planets.find((p) => p.id === "jupiter") as PlanetWave;
    expect(jup.amplitude).toBeCloseTo(0.5 * 1.55, 10);
    // a neutral, no-boost planet -> exactly 0.5
    const sat = f.planets.find((p) => p.id === "saturn") as PlanetWave;
    expect(sat.amplitude).toBeCloseTo(0.5, 10);
  });
});

// ============================================================================
// computeAuraState
// ============================================================================

describe("computeAuraState", () => {
  const chart = makeChart();
  const { planets } = buildEnergyFrame(chart, 0);

  it("produces glow strictly within (0, 1) via the sigmoid", () => {
    for (const t of [0, 1, 2.5, 10, -10]) {
      const aura = computeAuraState(planets, t);
      expect(aura.glow).toBeGreaterThan(0);
      expect(aura.glow).toBeLessThan(1);
    }
  });

  it("clamps the aura radius into [0.75, 1.55]", () => {
    for (const t of [0, 0.5, 1, 2, 3, 5, 10]) {
      const aura = computeAuraState(planets, t);
      expect(aura.baseRadius).toBeGreaterThanOrEqual(0.75);
      expect(aura.baseRadius).toBeLessThanOrEqual(1.55);
    }
  });

  it("clamps netFlux into [-2, 2]", () => {
    for (const t of [0, 0.5, 1, 2, 3, 5, 10]) {
      const aura = computeAuraState(planets, t);
      expect(aura.netFlux).toBeGreaterThanOrEqual(-2);
      expect(aura.netFlux).toBeLessThanOrEqual(2);
    }
  });

  it("derives glow = sigmoid(2.5 * netFlux)", () => {
    const aura = computeAuraState(planets, 1.234);
    expect(aura.glow).toBeCloseTo(1 / (1 + Math.exp(-2.5 * aura.netFlux)), 10);
  });

  it("derives baseRadius = clamp(1.1 + 0.35*netFlux)", () => {
    const aura = computeAuraState(planets, 1.234);
    const expected = Math.max(0.75, Math.min(1.55, 1.1 + 0.35 * aura.netFlux));
    expect(aura.baseRadius).toBeCloseTo(expected, 10);
  });

  it("reports stability as mean coherence", () => {
    const aura = computeAuraState(planets, 0);
    const mean =
      planets.reduce((s, p) => s + p.coherence, 0) / planets.length;
    expect(aura.stability).toBeCloseTo(mean, 10);
  });

  it("picks a lapis color for positive flux and oxide for negative", () => {
    // Empty -> netFlux 0 -> constructive (lapis-blue token).
    expect(computeAuraState([], 0).color).toEqual([0.42, 0.52, 0.85]);
    // Force a negative flux -> oxide-red token.
    const enemy: PlanetWave = {
      id: "saturn",
      orbitRadius: 6.5,
      orbitSpeed: 0.05,
      phase: 0,
      frequency: 0.7,
      amplitude: 1.0,
      coherence: 0.9,
      friendlinessToActive: -1,
      phaseShift: 0,
      waveColor: [0.2275, 0.3098, 0.6902],
      eclipticLongitude: 0,
    };
    // cos(0)=1 with negative coherence·amplitude yields nf<0 at t=0.
    expect(computeAuraState([enemy], Math.PI).color).toEqual([0.78, 0.34, 0.27]);
  });

  it("returns netFlux 0 and a neutral state for no planets", () => {
    const aura = computeAuraState([], 5);
    expect(aura.netFlux).toBe(0);
    expect(aura.stability).toBe(0.5);
    expect(aura.glow).toBeCloseTo(0.5, 10);
  });
});

// ============================================================================
// activeDashaFromChart
// ============================================================================

describe("activeDashaFromChart", () => {
  it("reads the engine-resolved maha/antar lords", () => {
    expect(activeDashaFromChart(makeChart())).toEqual({
      maha: "jupiter",
      antar: "mars",
    });
  });

  it("falls back to sun maha / null antar when the engine resolved none", () => {
    const chart = makeChart({
      dashas: {
        maha_dasha_sequence: [],
        current_maha: null,
        current_antar: null,
        current_pratyantar: null,
      },
    });
    expect(activeDashaFromChart(chart)).toEqual({ maha: "sun", antar: null });
  });
});
