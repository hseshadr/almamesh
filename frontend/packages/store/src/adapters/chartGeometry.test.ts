import { describe, expect, it } from "vitest";

import { PLANET_COLORS } from "@almamesh/constants";
import type {
  PlanetPosition,
  SiderealChart,
} from "@almamesh/browser/types";

import {
  buildChartGeometry,
  buildVargaGeometry,
  type VargaChart,
  type ZodiacSign,
} from "./chartGeometry";

// --- Hand-built fixture -----------------------------------------------------
// Small, fully deterministic chart. Lagna = Gemini (signIndex 2), so:
//   houseOfSign(Gemini=2)  -> house 1
//   houseOfSign(Cancer=3)  -> house 2
//   houseOfSign(Aries=0)   -> house 11
//   houseOfSign(Pisces=11) -> house 10
// Planets carry their engine-assigned whole-sign `house` directly.

function planet(overrides: Partial<PlanetPosition> & { name: string }): PlanetPosition {
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

const FIXTURE: SiderealChart = {
  ayanamsa_value: 23.5,
  lagna: {
    longitude: 65.4, // Gemini 5.4
    sign: "Gemini",
    sign_degrees: 5.4,
    sign_lord: "mercury",
    nakshatra: "Mrigashira",
    nakshatra_pada: 3,
    nakshatra_lord: "mars",
  },
  planets: {
    // Sun in Cancer (signIndex 3), house 2, retrograde+combust, ruling the 3rd.
    sun: planet({
      name: "sun",
      longitude: 100.5,
      sign: "Cancer",
      sign_degrees: 10.5,
      sign_lord: "moon",
      house: 2,
      is_retrograde: true,
      is_combust: true,
      houses_ruled: [3],
      dignity: "debilitated",
    }),
    // Moon in Cancer too (same house 2) -> tests multi-planet grouping.
    moon: planet({
      name: "moon",
      longitude: 115.0,
      sign: "Cancer",
      sign_degrees: 25.0,
      sign_lord: "moon",
      house: 2,
      dignity: "own_sign",
    }),
    // Mars in Aries (signIndex 0), house 11; the chart's yogakaraka.
    mars: planet({
      name: "mars",
      longitude: 12.0,
      sign: "Aries",
      sign_degrees: 12.0,
      sign_lord: "mars",
      house: 11,
      dignity: "own_sign",
      houses_ruled: [6, 11],
      is_yogakaraka: true,
    }),
    // Rahu in Pisces (signIndex 11), house 10.
    rahu: planet({
      name: "rahu",
      longitude: 345.0,
      sign: "Pisces",
      sign_degrees: 15.0,
      sign_lord: "jupiter",
      house: 10,
    }),
  },
  houses: {
    "1": { house: 1, longitude: 60, sign: "Gemini", sign_lord: "mercury" },
    "2": { house: 2, longitude: 90, sign: "Cancer", sign_lord: "moon" },
    "3": { house: 3, longitude: 120, sign: "Leo", sign_lord: "sun" },
    "4": { house: 4, longitude: 150, sign: "Virgo", sign_lord: "mercury" },
    "5": { house: 5, longitude: 180, sign: "Libra", sign_lord: "venus" },
    "6": { house: 6, longitude: 210, sign: "Scorpio", sign_lord: "mars" },
    "7": { house: 7, longitude: 240, sign: "Sagittarius", sign_lord: "jupiter" },
    "8": { house: 8, longitude: 270, sign: "Capricorn", sign_lord: "saturn" },
    "9": { house: 9, longitude: 300, sign: "Aquarius", sign_lord: "saturn" },
    "10": { house: 10, longitude: 330, sign: "Pisces", sign_lord: "jupiter" },
    "11": { house: 11, longitude: 0, sign: "Aries", sign_lord: "mars" },
    "12": { house: 12, longitude: 30, sign: "Taurus", sign_lord: "venus" },
  },
  dashas: {
    maha_dasha_sequence: [],
    current_maha: null,
    current_antar: null,
    current_pratyantar: null,
  },
  yogas: [],
  navamsa: null,
};

const ARIES_TO_PISCES: readonly ZodiacSign[] = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

describe("buildChartGeometry", () => {
  const geo = buildChartGeometry(FIXTURE);

  it("marks the rasi geometry as degree-precision (real engine longitudes)", () => {
    expect(geo.precision).toBe("degree");
  });

  it("derives the lagna sign + signIndex (Gemini -> 2)", () => {
    expect(geo.lagna.sign).toBe("Gemini");
    expect(geo.lagna.signIndex).toBe(2);
    expect(geo.lagna.longitude).toBe(65.4);
    expect(geo.lagna.signDegrees).toBe(5.4);
  });

  it("maps each sign name to its 0..11 index (Aries=0..Pisces=11)", () => {
    const sun = geo.planets.find((p) => p.name === "sun");
    const mars = geo.planets.find((p) => p.name === "mars");
    const rahu = geo.planets.find((p) => p.name === "rahu");
    expect(sun?.signIndex).toBe(3); // Cancer
    expect(mars?.signIndex).toBe(0); // Aries
    expect(rahu?.signIndex).toBe(11); // Pisces
  });

  it("uses 2-letter glyph labels for planets", () => {
    const byName = Object.fromEntries(geo.planets.map((p) => [p.name, p.label]));
    expect(byName.sun).toBe("Su");
    expect(byName.moon).toBe("Mo");
    expect(byName.mars).toBe("Ma");
    expect(byName.rahu).toBe("Ra");
  });

  it("pulls the planet color from PLANET_COLORS", () => {
    const sun = geo.planets.find((p) => p.name === "sun");
    expect(sun?.color).toBe(PLANET_COLORS.sun);
    const rahu = geo.planets.find((p) => p.name === "rahu");
    expect(rahu?.color).toBe(PLANET_COLORS.rahu);
  });

  it("passes retrograde / combust / lordship / dignity through", () => {
    const sun = geo.planets.find((p) => p.name === "sun");
    expect(sun?.isRetrograde).toBe(true);
    expect(sun?.isCombust).toBe(true);
    expect(sun?.housesRuled).toEqual([3]);
    expect(sun?.isYogakaraka).toBe(false);
    expect(sun?.dignity).toBe("debilitated");
    expect(sun?.nakshatra).toBe("Ashwini");
    expect(sun?.pada).toBe(1);
    expect(sun?.signDegrees).toBe(10.5);

    const mars = geo.planets.find((p) => p.name === "mars");
    expect(mars?.housesRuled).toEqual([6, 11]);
    expect(mars?.isYogakaraka).toBe(true);

    const moon = geo.planets.find((p) => p.name === "moon");
    expect(moon?.isRetrograde).toBe(false);
    expect(moon?.housesRuled).toEqual([]); // nodes/unset lord nothing
  });

  it("produces houses[] length 12 ordered house 1..12 (house-fixed / North Indian)", () => {
    expect(geo.houses).toHaveLength(12);
    expect(geo.houses.map((h) => h.house)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // House 1 carries Gemini (from chart.houses["1"]).
    expect(geo.houses[0].sign).toBe("Gemini");
    expect(geo.houses[0].signIndex).toBe(2);
    expect(geo.houses[1].sign).toBe("Cancer");
  });

  it("groups planets into their engine-assigned house", () => {
    const house2 = geo.houses.find((h) => h.house === 2);
    expect(house2?.planets.map((p) => p.name).sort()).toEqual(["moon", "sun"]);
    const house11 = geo.houses.find((h) => h.house === 11);
    expect(house11?.planets.map((p) => p.name)).toEqual(["mars"]);
    const house10 = geo.houses.find((h) => h.house === 10);
    expect(house10?.planets.map((p) => p.name)).toEqual(["rahu"]);
    // An empty house carries no planets.
    const house1 = geo.houses.find((h) => h.house === 1);
    expect(house1?.planets).toEqual([]);
  });

  it("produces signs[] length 12 ordered Aries..Pisces (sign-fixed / South Indian)", () => {
    expect(geo.signs).toHaveLength(12);
    expect(geo.signs.map((s) => s.sign)).toEqual(ARIES_TO_PISCES);
    expect(geo.signs.map((s) => s.signIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("derives houseOfSign from the lagna (Gemini lagna -> Gemini is house 1)", () => {
    const bySign = Object.fromEntries(geo.signs.map((s) => [s.sign, s.house]));
    expect(bySign.Gemini).toBe(1); // lagna sign
    expect(bySign.Cancer).toBe(2);
    expect(bySign.Aries).toBe(11);
    expect(bySign.Pisces).toBe(10);
    expect(bySign.Taurus).toBe(12);
  });

  it("places planets into the sign-fixed cells too", () => {
    const cancer = geo.signs.find((s) => s.sign === "Cancer");
    expect(cancer?.planets.map((p) => p.name).sort()).toEqual(["moon", "sun"]);
    const aries = geo.signs.find((s) => s.sign === "Aries");
    expect(aries?.planets.map((p) => p.name)).toEqual(["mars"]);
    const gemini = geo.signs.find((s) => s.sign === "Gemini");
    expect(gemini?.planets).toEqual([]);
  });

  it("returns the same ChartPlanet objects in both houses[] and signs[]", () => {
    const sunInHouse = geo.houses
      .find((h) => h.house === 2)
      ?.planets.find((p) => p.name === "sun");
    const sunInSign = geo.signs
      .find((s) => s.sign === "Cancer")
      ?.planets.find((p) => p.name === "sun");
    expect(sunInHouse).toBe(sunInSign);
  });
});

// --- buildVargaGeometry (D9 Navamsa) ---------------------------------------
// A varga maps each graha onto a SIGN only (no degrees). House is whole-sign
// from the VARGA lagna. Hand-built D9: navamsa lagna = Gemini (signIndex 2), so
// Gemini -> house 1, Sagittarius -> house 7 (opposite), Capricorn -> house 8.
const VARGA_FIXTURE: VargaChart = {
  name: "D9",
  lagna_sign: "Gemini",
  lagna_sign_lord: "mercury",
  planets: {
    // Moon is combust in D1 -> the engine carries the flag onto the varga.
    sun: { name: "sun", sign: "Capricorn", sign_lord: "saturn" },
    moon: { name: "moon", sign: "Scorpio", sign_lord: "mars", is_combust: true },
    jupiter: { name: "jupiter", sign: "Sagittarius", sign_lord: "jupiter" },
  },
};

describe("buildVargaGeometry (D9)", () => {
  const geo = buildVargaGeometry(VARGA_FIXTURE);

  it("marks the varga as sign-precision so renderers suppress ALL degree text", () => {
    // The engine emits sign placements only for a varga — there are no
    // in-varga longitudes. A fabricated "0°00'" on a plate reads as a
    // calculation bug to any practitioner, so the geometry itself must say
    // "no degrees exist here".
    expect(geo.precision).toBe("sign");
  });

  it("fabricates no chart facts for varga grahas (unknown stays empty)", () => {
    const sun = geo.planets.find((p) => p.name === "sun");
    // Dignity/nakshatra are not engine-emitted per varga: empty, not "neutral".
    expect(sun?.dignity).toBe("");
    expect(sun?.nakshatra).toBe("");
  });

  it("derives the varga lagna sign + index (Gemini -> 2)", () => {
    expect(geo.lagna.sign).toBe("Gemini");
    expect(geo.lagna.signIndex).toBe(2);
    // No within-sign degree exists in a varga (inert 0; guarded by precision).
    expect(geo.lagna.signDegrees).toBe(0);
  });

  it("places each graha into its navamsa sign with a derived whole-sign house", () => {
    const sun = geo.planets.find((p) => p.name === "sun");
    expect(sun?.sign).toBe("Capricorn");
    expect(sun?.signIndex).toBe(9);
    // Capricorn(9) from Gemini(2) lagna: ((9-2)%12)+1 = 8.
    expect(sun?.house).toBe(8);
    const jup = geo.planets.find((p) => p.name === "jupiter");
    expect(jup?.sign).toBe("Sagittarius");
    // Sagittarius(8) from Gemini(2): ((8-2)%12)+1 = 7 (the 7th house).
    expect(jup?.house).toBe(7);
    expect(sun?.signDegrees).toBe(0);
  });

  it("produces house-fixed (North) and sign-fixed (South) views the SVGs consume", () => {
    expect(geo.houses).toHaveLength(12);
    expect(geo.houses.map((h) => h.house)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    // House 1 carries the varga lagna sign (Gemini).
    expect(geo.houses[0].sign).toBe("Gemini");
    expect(geo.signs).toHaveLength(12);
    expect(geo.signs.map((s) => s.sign)).toEqual(ARIES_TO_PISCES);
    // Sun (Capricorn) appears in the Capricorn sign cell.
    const cap = geo.signs.find((s) => s.sign === "Capricorn");
    expect(cap?.planets.map((p) => p.name)).toEqual(["sun"]);
  });

  it("colors grahas from PLANET_COLORS and uses 2-letter glyphs", () => {
    const sun = geo.planets.find((p) => p.name === "sun");
    expect(sun?.color).toBe(PLANET_COLORS.sun);
    expect(sun?.label).toBe("Su");
  });

  it("carries the engine's D1 combustion flag onto the varga graha", () => {
    // Regression: the varga adapter used to hardcode isCombust=false, so a
    // combust graha rendered full-opacity in every divisional chart. It must
    // now reflect the flag the engine carries from D1.
    const moon = geo.planets.find((p) => p.name === "moon");
    expect(moon?.isCombust).toBe(true);
    // A graha the engine did not flag stays not-combust (absent -> false).
    const jupiter = geo.planets.find((p) => p.name === "jupiter");
    expect(jupiter?.isCombust).toBe(false);
  });
});
