/**
 * The alternate ascendant — the second chart a near-cusp birth time could have.
 *
 * WHOLE-SIGN HAS NO INTERIOR CUSPS. House boundaries ARE sign boundaries, so
 * once the rising sign is fixed the whole house layout is determined. A quadrant
 * system spreads birth-time doubt thinly across twelve cusps; whole-sign
 * concentrates all of it into ONE binary — which sign is rising. When that flips,
 * all twelve houses move together and every graha changes house at once. There
 * is no partial state.
 *
 * That is why the honest "alternative reading" for a house-dependent claim in a
 * near-cusp chart is not prose hedging. It is the actual second chart, computed:
 * "if the recorded time is later, the lagna is Pisces; Mercury moves 1st -> 12th,
 * Sun and Venus 2nd -> 1st". A reader can then go check a birth certificate
 * knowing exactly what hangs on it.
 *
 * FAIL-CLOSED SELF-CHECK. Before projecting any counterfactual, the same formula
 * is run against the CURRENT lagna and compared to the houses the engine already
 * computed. If they disagree — a different house system, an older bundle, a bug
 * here — the projection is unfounded and `alternateLagna` returns null rather
 * than printing a confident second chart nobody can trust.
 */

import type { SiderealChart } from '@almamesh/browser/types';

/** Aries..Pisces in zodiacal order (engine Title-Case names). */
const ZODIAC_ORDER: readonly string[] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function signIndex(sign: string): number {
  return ZODIAC_ORDER.findIndex((name) => name.toLowerCase() === sign.toLowerCase());
}

/**
 * The whole-sign house a graha occupies, counting the rising sign as the 1st.
 * Returns null for an unrecognised sign name rather than guessing a number.
 */
export function wholeSignHouse(lagnaSign: string, planetSign: string): number | null {
  const lagna = signIndex(lagnaSign);
  const planet = signIndex(planetSign);
  if (lagna < 0 || planet < 0) {
    return null;
  }
  return ((planet - lagna + 12) % 12) + 1;
}

/** One graha's move between the two candidate charts. */
export interface HouseShift {
  readonly planet: string;
  readonly from: number;
  readonly to: number;
}

/** The second chart, fully projected. */
export interface AlternateLagna {
  /** The rising sign this report was computed for. */
  readonly currentSign: string;
  /** The rising sign a birth time across the boundary would give. */
  readonly alternateSign: string;
  /** Exact degrees from the ascendant to that boundary (engine measurement). */
  readonly cuspDistanceDeg: number;
  /** Every graha's house in both charts, in engine planet order. */
  readonly shifts: readonly HouseShift[];
}

/**
 * The alternate chart when the ascendant sits within `thresholdDeg` of a sign
 * boundary, else null — a mid-sign ascendant has no live second chart and must
 * not have one cluttering its report.
 *
 * Returns null (never a guess) when the engine omits its cusp fields, when a
 * sign name is unrecognised, or when the whole-sign self-check fails.
 */
export function alternateLagna(chart: SiderealChart, thresholdDeg = 3): AlternateLagna | null {
  const { lagna } = chart;
  const distance = lagna.lagna_cusp_distance_deg;
  const adjacent = lagna.lagna_adjacent_sign;
  if (typeof distance !== 'number' || adjacent == null || distance > thresholdDeg) {
    return null;
  }

  const shifts: HouseShift[] = [];
  for (const [key, planet] of Object.entries(chart.planets)) {
    const current = wholeSignHouse(lagna.sign, planet.sign);
    const projected = wholeSignHouse(adjacent, planet.sign);
    if (current === null || projected === null) {
      return null;
    }
    // THE SELF-CHECK: our whole-sign model must reproduce the engine's own
    // house for the CURRENT lagna. If it cannot, we have no standing to
    // project the counterfactual.
    if (current !== planet.house) {
      return null;
    }
    shifts.push({ planet: key, from: current, to: projected });
  }

  return {
    currentSign: lagna.sign,
    alternateSign: adjacent,
    cuspDistanceDeg: distance,
    shifts,
  };
}
