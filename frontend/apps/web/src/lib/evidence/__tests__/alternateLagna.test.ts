/**
 * The alternate ascendant — the second chart a near-cusp birth time could have.
 *
 * WHY THIS EXISTS. Whole-sign houses have no interior cusps: house boundaries
 * ARE sign boundaries. So the entire house layout is a function of ONE binary —
 * which sign is rising. A quadrant system spreads birth-time doubt thinly over
 * twelve cusps; whole-sign concentrates all of it into that single flip, and
 * when it flips, all twelve houses move at once. There is no partial state.
 *
 * That makes the honest "alternative reading" for any house-dependent claim not
 * prose hedging but THE ACTUAL SECOND CHART — computed, not described.
 */

import { describe, expect, it } from 'vitest';

import { alternateLagna, wholeSignHouse } from '../alternateLagna';
import { nearCuspChart, secureLagnaChart } from './evidenceFixtures';

describe('wholeSignHouse', () => {
  it('counts houses from the rising sign, wrapping the zodiac', () => {
    // Aquarius rising (index 10): Aquarius is the 1st, Pisces the 2nd,
    // Capricorn the 12th, Taurus the 4th.
    expect(wholeSignHouse('Aquarius', 'Aquarius')).toBe(1);
    expect(wholeSignHouse('Aquarius', 'Pisces')).toBe(2);
    expect(wholeSignHouse('Aquarius', 'Capricorn')).toBe(12);
    expect(wholeSignHouse('Aquarius', 'Taurus')).toBe(4);
  });

  it('returns null for an unknown sign rather than guessing', () => {
    expect(wholeSignHouse('Aquarius', 'Ophiuchus')).toBeNull();
  });
});

describe('alternateLagna', () => {
  it('returns null when the ascendant is not near a sign boundary', () => {
    // A mid-sign ascendant has no live second chart, so the report must not
    // clutter itself with one.
    expect(alternateLagna(secureLagnaChart(), 3)).toBeNull();
  });

  it('projects the full alternate house layout for a near-cusp ascendant', () => {
    const alternate = alternateLagna(nearCuspChart(), 3);
    expect(alternate).not.toBeNull();
    expect(alternate?.currentSign).toBe('Aquarius');
    expect(alternate?.alternateSign).toBe('Pisces');
    expect(alternate?.cuspDistanceDeg).toBeCloseTo(1.18, 2);
  });

  it('moves every planet by exactly one house, and names each move', () => {
    const alternate = alternateLagna(nearCuspChart(), 3);
    const byPlanet = new Map(alternate?.shifts.map((s) => [s.planet, s]));

    // Aquarius rising -> Pisces rising renumbers everything by one.
    expect(byPlanet.get('mercury')).toEqual({ planet: 'mercury', from: 1, to: 12 });
    expect(byPlanet.get('sun')).toEqual({ planet: 'sun', from: 2, to: 1 });
    expect(byPlanet.get('venus')).toEqual({ planet: 'venus', from: 2, to: 1 });
    expect(byPlanet.get('moon')).toEqual({ planet: 'moon', from: 12, to: 11 });
    expect(byPlanet.get('saturn')).toEqual({ planet: 'saturn', from: 4, to: 3 });

    // Whole-sign: nothing stays put. Every graha shifts, none is exempt.
    expect(alternate?.shifts.every((s) => s.from !== s.to)).toBe(true);
    expect(alternate?.shifts).toHaveLength(nearCuspChart().yogas.length > 0 ? 5 : 5);
  });

  it('FAILS CLOSED when its whole-sign model disagrees with the engine', () => {
    // The projection is only trustworthy if the SAME formula reproduces the
    // houses the engine already computed for the CURRENT lagna. If it cannot,
    // the counterfactual is unfounded and must not be offered at all.
    const chart = nearCuspChart();
    const tampered = {
      ...chart,
      planets: {
        ...chart.planets,
        // Engine says house 2; whole-sign from an Aquarius lagna says 2 as well,
        // so claiming 7 makes the model and the engine disagree.
        sun: { ...chart.planets.sun, house: 7 },
      },
    };
    expect(alternateLagna(tampered, 3)).toBeNull();
  });
});
