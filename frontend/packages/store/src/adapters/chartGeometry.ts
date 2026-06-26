// Pure, renderer-agnostic chart-geometry adapter.
//
// Reshapes the engine's flat `SiderealChart` into a model that a North Indian
// (house-fixed) chart, a South Indian (sign-fixed) chart, and a planetary table
// can all consume directly. It RESHAPES and derives display values ONLY — it
// computes no astrology. House numbers and longitudes come from the Python
// engine; per the project rule we never reimplement zodiac math in TypeScript.
//
// The single derivation done here is `houseOfSign`, which is not astrology but
// a fixed rotation of the 12 signs onto the 12 houses given the lagna's sign
// (whole-sign house system): house = ((signIndex - lagnaSignIndex + 12) % 12) + 1.

import { PLANET_COLORS } from "@almamesh/constants";
import type { SiderealChart } from "@almamesh/browser/types";

/** Zodiac sign names exactly as the engine emits them (Title Case enum values). */
export type ZodiacSign =
  | "Aries"
  | "Taurus"
  | "Gemini"
  | "Cancer"
  | "Leo"
  | "Virgo"
  | "Libra"
  | "Scorpio"
  | "Sagittarius"
  | "Capricorn"
  | "Aquarius"
  | "Pisces";

/** Aries..Pisces in zodiacal order; the array index is the sign's 0..11 index. */
const ZODIAC_ORDER: readonly ZodiacSign[] = [
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

/** 2-letter glyph labels keyed by the engine's lowercase planet name. */
const PLANET_LABELS: Readonly<Record<string, string>> = {
  sun: "Su",
  moon: "Mo",
  mars: "Ma",
  mercury: "Me",
  jupiter: "Ju",
  venus: "Ve",
  saturn: "Sa",
  rahu: "Ra",
  ketu: "Ke",
};

export interface ChartPlanet {
  readonly name: string; // lowercase engine key 'sun'..'ketu'
  readonly label: string; // short glyph/abbrev, e.g. 'Su','Ma','Ra'
  readonly longitude: number; // 0–360 ecliptic
  readonly sign: ZodiacSign;
  readonly signIndex: number; // 0..11 (Aries=0)
  readonly signDegrees: number; // 0–30 within sign
  readonly house: number; // 1..12 (whole-sign, from engine)
  readonly nakshatra: string;
  readonly pada: number;
  readonly dignity: string;
  readonly isRetrograde: boolean;
  readonly isCombust: boolean;
  /** Whole-sign houses this graha lords (engine-computed); [] for Rahu/Ketu. */
  readonly housesRuled: readonly number[];
  /** Engine BPHS Yogakaraka flag (lords a kendra AND a trikona). */
  readonly isYogakaraka: boolean;
  readonly color: string; // from PLANET_COLORS
}

export interface ChartHouse {
  readonly house: number; // 1..12
  readonly sign: ZodiacSign;
  readonly signIndex: number;
  readonly planets: readonly ChartPlanet[]; // planets in this house
}

export interface ChartSign {
  readonly sign: ZodiacSign;
  readonly signIndex: number;
  readonly house: number;
  readonly planets: readonly ChartPlanet[];
}

/**
 * Positional precision of a chart's placements.
 *
 * - `"degree"` — real engine longitudes exist (the D1 rāśi): renderers may
 *   print within-sign degree readouts.
 * - `"sign"` — sign-placement only (divisional/varga charts): the engine emits
 *   NO in-varga longitudes, so renderers MUST NOT print degree text. A varga
 *   is classically a sign chart; a fabricated "0°00'" reads as a calculation
 *   bug to any practitioner.
 */
export type ChartPrecision = "degree" | "sign";

export interface ChartGeometry {
  /** "degree" when real within-sign degrees exist; "sign" for varga charts. */
  readonly precision: ChartPrecision;
  readonly lagna: {
    readonly sign: ZodiacSign;
    readonly signIndex: number;
    readonly longitude: number;
    readonly signDegrees: number;
  };
  readonly planets: readonly ChartPlanet[];
  /** length 12, ordered house 1..12 — for the HOUSE-FIXED North Indian grid. */
  readonly houses: readonly ChartHouse[];
  /** length 12, ordered Aries..Pisces — for the SIGN-FIXED South Indian grid. */
  readonly signs: readonly ChartSign[];
}

/** Map an engine sign name to its 0..11 zodiacal index (Aries=0..Pisces=11). */
function signIndexOf(sign: string): number {
  const index = ZODIAC_ORDER.indexOf(sign as ZodiacSign);
  if (index === -1) {
    throw new Error(`buildChartGeometry: unknown zodiac sign "${sign}"`);
  }
  return index;
}

/** Color for a planet, defaulting to text-muted-equivalent if unknown. */
function colorOf(name: string): string {
  return (PLANET_COLORS as Readonly<Record<string, string>>)[name] ?? "#8A8576";
}

function toChartPlanet(
  raw: SiderealChart["planets"][string],
): ChartPlanet {
  return {
    name: raw.name,
    label: PLANET_LABELS[raw.name] ?? raw.name.slice(0, 2),
    longitude: raw.longitude,
    sign: raw.sign as ZodiacSign,
    signIndex: signIndexOf(raw.sign),
    signDegrees: raw.sign_degrees,
    house: raw.house,
    nakshatra: raw.nakshatra,
    pada: raw.nakshatra_pada,
    dignity: raw.dignity,
    isRetrograde: raw.is_retrograde,
    isCombust: raw.is_combust,
    housesRuled: raw.houses_ruled,
    isYogakaraka: raw.is_yogakaraka,
    color: colorOf(raw.name),
  };
}

/**
 * Reshape the engine's flat `SiderealChart` into a renderer-agnostic
 * `ChartGeometry`. Pure: same input → same output, no astrology computed.
 */
export function buildChartGeometry(chart: SiderealChart): ChartGeometry {
  const lagnaSignIndex = signIndexOf(chart.lagna.sign);
  const planets: readonly ChartPlanet[] = Object.values(chart.planets).map(
    toChartPlanet,
  );

  // House-fixed view (North Indian): house 1..12, sign from the engine's cusps.
  const houses: readonly ChartHouse[] = Array.from({ length: 12 }, (_, i) => {
    const houseNumber = i + 1;
    const cusp = chart.houses[String(houseNumber)];
    return {
      house: houseNumber,
      sign: cusp.sign as ZodiacSign,
      signIndex: signIndexOf(cusp.sign),
      planets: planets.filter((p) => p.house === houseNumber),
    };
  });

  // Sign-fixed view (South Indian): Aries..Pisces, house derived from lagna.
  const signs: readonly ChartSign[] = ZODIAC_ORDER.map((sign, signIndex) => ({
    sign,
    signIndex,
    house: ((signIndex - lagnaSignIndex + 12) % 12) + 1,
    planets: planets.filter((p) => p.signIndex === signIndex),
  }));

  return {
    precision: "degree",
    lagna: {
      sign: chart.lagna.sign as ZodiacSign,
      signIndex: lagnaSignIndex,
      longitude: chart.lagna.longitude,
      signDegrees: chart.lagna.sign_degrees,
    },
    planets,
    houses,
    signs,
  };
}

/** One graha's placement in a divisional (varga) chart: sign + lord only. */
export interface VargaPlanet {
  readonly name: string; // lowercase engine key 'sun'..'ketu'
  readonly sign: string; // engine Title-Case sign value
  readonly sign_lord: string;
}

/** A divisional chart as the engine emits it (e.g. D9 Navamsa). */
export interface VargaChart {
  readonly name: string; // "D9", "D10", ...
  readonly lagna_sign: string;
  readonly lagna_sign_lord: string;
  readonly planets: Readonly<Record<string, VargaPlanet>>;
}

/**
 * Reshape an engine varga chart (sign-per-graha, no longitudes) into the SAME
 * renderer-agnostic `ChartGeometry` the D1 SVGs consume, so a divisional chart
 * renders in BOTH North and South styles with no renderer changes.
 *
 * A varga maps a longitude onto a SIGN only — there is no within-sign degree.
 * The geometry is therefore marked `precision: "sign"`, and renderers MUST
 * suppress all degree text for it (a fabricated `0°00'` reads as a calculation
 * bug to a practitioner). The numeric `longitude`/`signDegrees` fields remain
 * in the shape only because `ChartPlanet` is shared with the degree-precision
 * D1 path; their 0 values are inert and must never be rendered. Houses are
 * whole-sign from the varga lagna, the same rotation the D1 path uses:
 * house = ((signIndex - lagnaSignIndex) % 12) + 1.
 */
export function buildVargaGeometry(varga: VargaChart): ChartGeometry {
  const lagnaSignIndex = signIndexOf(varga.lagna_sign);
  const planets: readonly ChartPlanet[] = Object.values(varga.planets).map(
    (raw) => vargaToChartPlanet(raw, lagnaSignIndex),
  );

  const houses: readonly ChartHouse[] = Array.from({ length: 12 }, (_, i) => {
    const signIndex = (lagnaSignIndex + i) % 12;
    return {
      house: i + 1,
      sign: ZODIAC_ORDER[signIndex],
      signIndex,
      planets: planets.filter((p) => p.house === i + 1),
    };
  });

  const signs: readonly ChartSign[] = ZODIAC_ORDER.map((sign, signIndex) => ({
    sign,
    signIndex,
    house: ((signIndex - lagnaSignIndex + 12) % 12) + 1,
    planets: planets.filter((p) => p.signIndex === signIndex),
  }));

  return {
    precision: "sign",
    lagna: {
      sign: varga.lagna_sign as ZodiacSign,
      signIndex: lagnaSignIndex,
      // Inert placeholders: a varga lagna has no degree (precision: "sign").
      longitude: 0,
      signDegrees: 0,
    },
    planets,
    houses,
    signs,
  };
}

/**
 * A varga graha → ChartPlanet (house from the varga lagna). The engine emits
 * ONLY name/sign/lord per varga graha; everything else is "unknown", encoded
 * as inert empty values guarded by the geometry's `precision: "sign"` — never
 * fabricated facts (no "neutral" dignity, no 0° degree).
 */
function vargaToChartPlanet(
  raw: VargaPlanet,
  lagnaSignIndex: number,
): ChartPlanet {
  const signIndex = signIndexOf(raw.sign);
  return {
    name: raw.name,
    label: PLANET_LABELS[raw.name] ?? raw.name.slice(0, 2),
    longitude: 0,
    sign: raw.sign as ZodiacSign,
    signIndex,
    signDegrees: 0,
    house: ((signIndex - lagnaSignIndex + 12) % 12) + 1,
    nakshatra: "",
    pada: 0,
    dignity: "",
    isRetrograde: false,
    isCombust: false,
    // Lordship is a RASI (D1) concept; the engine emits none per varga graha.
    housesRuled: [],
    isYogakaraka: false,
    color: colorOf(raw.name),
  };
}
