/**
 * Synthetic charts for the evidence-layer suites.
 *
 * `nearCuspChart` deliberately mirrors the SHAPE of the hardest real case: an
 * ascendant a hair inside Aquarius, with grahas spread so that the Aquarius ->
 * Pisces flip moves every one of them. It is synthetic — no real birth data
 * lives in this repository — but the geometry is the geometry that breaks
 * things, which is the point of a fixture.
 *
 * `secureLagnaChart` is the control: the same grahas, an ascendant parked
 * mid-sign, so nothing about it should attract a near-cusp caveat.
 */

import type { PlanetPosition, SiderealChart, YogaData } from '@almamesh/browser/types';

function planet(over: Partial<PlanetPosition> & Pick<PlanetPosition, 'name'>): PlanetPosition {
  return {
    longitude: 0,
    latitude: 0,
    distance: 1,
    speed: 1,
    is_retrograde: false,
    sign: 'Aries',
    sign_degrees: 10,
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
    ...over,
  };
}

/** Venus exalted AND combust — the case a dignity-only column cannot express. */
const VENUS_EXALTED_COMBUST = planet({
  name: 'venus',
  longitude: 342.92,
  sign: 'Pisces',
  sign_degrees: 12.92,
  sign_lord: 'jupiter',
  nakshatra: 'Uttara Bhadrapada',
  nakshatra_pada: 3,
  nakshatra_lord: 'saturn',
  house: 2,
  dignity: 'exalted',
  is_combust: true,
  combustion_separation_deg: 2.759,
  houses_ruled: [4, 9],
  is_yogakaraka: true,
  speed: 1.24,
});

const SUN = planet({
  name: 'sun',
  longitude: 345.68,
  sign: 'Pisces',
  sign_degrees: 15.68,
  sign_lord: 'jupiter',
  nakshatra: 'Uttara Bhadrapada',
  nakshatra_pada: 4,
  nakshatra_lord: 'saturn',
  house: 2,
  houses_ruled: [7],
  speed: 0.99,
});

const MOON = planet({
  name: 'moon',
  longitude: 289.51,
  sign: 'Capricorn',
  sign_degrees: 19.51,
  sign_lord: 'saturn',
  nakshatra: 'Shravana',
  nakshatra_pada: 3,
  nakshatra_lord: 'moon',
  house: 12,
  combustion_separation_deg: 56.17,
  houses_ruled: [6],
  speed: 12.82,
});

const MERCURY = planet({
  name: 'mercury',
  longitude: 321.86,
  sign: 'Aquarius',
  sign_degrees: 21.86,
  sign_lord: 'saturn',
  nakshatra: 'Purva Bhadrapada',
  nakshatra_pada: 1,
  nakshatra_lord: 'jupiter',
  house: 1,
  combustion_separation_deg: 23.82,
  houses_ruled: [5, 8],
  speed: 0.28,
});

/** Retrograde, and just OUTSIDE its 15 deg orb — a deliberate boundary case. */
const SATURN_RETRO_NEAR_ORB = planet({
  name: 'saturn',
  longitude: 51.93,
  sign: 'Taurus',
  sign_degrees: 21.93,
  sign_lord: 'venus',
  nakshatra: 'Rohini',
  nakshatra_pada: 4,
  nakshatra_lord: 'moon',
  house: 4,
  is_retrograde: true,
  is_combust: false,
  combustion_separation_deg: 15.4,
  houses_ruled: [1, 12],
  speed: -0.077,
});

const PLANETS: Readonly<Record<string, PlanetPosition>> = {
  sun: SUN,
  moon: MOON,
  mercury: MERCURY,
  venus: VENUS_EXALTED_COMBUST,
  saturn: SATURN_RETRO_NEAR_ORB,
};

/** A house-referencing yoga: its verdict cannot survive the lagna flipping. */
const HOUSE_YOGA: YogaData = {
  name: 'Test House Yoga',
  display_name: 'Test House Yoga (Venus in the 2nd)',
  category: 'dhana',
  description: 'A yoga defined by house placement',
  effects: 'Accumulation',
  grade: 'moderate',
  strength_factors: [
    { factor_type: 'dignity', planet: 'venus', value: 'exalted', basis: 'BPHS dignity', mark: 1 },
    {
      factor_type: 'house_class',
      planet: 'venus',
      value: 'dusthana (house 2)',
      basis: 'Whole-sign house class from the lagna',
      mark: -1,
    },
  ],
  net_marks: 0,
  max_favorable: 2,
  max_unfavorable: 2,
  strength_pct: 50,
  strength_tier: 'structural',
  planets_involved: ['venus'],
  houses_involved: [2],
  planetary_signature: 'venus_h2',
  formation_rules: [
    {
      rule: 'dhana.lord_placed',
      description: 'The 2nd lord is placed in a supportive house',
      source: 'BPHS, Dhana-yoga adhyaya',
      planets: ['venus'],
      houses: [2],
    },
  ],
};

/** A sign-only yoga: no house appears in its definition, so it cannot fork. */
const SIGN_YOGA: YogaData = {
  name: 'Test Sign Yoga',
  display_name: 'Test Sign Yoga (Venus exalted)',
  category: 'auspicious',
  description: 'A yoga defined purely by sign dignity',
  effects: 'Grace',
  grade: 'strong',
  strength_factors: [
    { factor_type: 'dignity', planet: 'venus', value: 'exalted', basis: 'BPHS dignity', mark: 1 },
  ],
  net_marks: 1,
  max_favorable: 1,
  max_unfavorable: 1,
  strength_pct: 100,
  strength_tier: 'structural',
  planets_involved: ['venus'],
  houses_involved: [],
  planetary_signature: 'venus_exalted',
  formation_rules: [
    {
      rule: 'dignity.exalted',
      description: 'Venus occupies its exaltation sign',
      source: 'BPHS, dignity adhyaya',
      planets: ['venus'],
      houses: [],
    },
  ],
};

const DASHAS: SiderealChart['dashas'] = {
  maha_dasha_sequence: [
    {
      lord: 'saturn',
      start_date: '2017-02-08T21:22:52.961049Z',
      end_date: '2036-02-09T15:22:52.961049Z',
      duration_years: 19,
      antar_sequence: [
        {
          lord: 'venus',
          start_date: '2023-12-01T15:13:52.961049Z',
          end_date: '2027-01-31T06:13:52.961049Z',
          duration_years: 3.1666666666666665,
        },
      ],
    },
  ],
  current_maha: {
    lord: 'saturn',
    start_date: '2017-02-08T21:22:52.961049Z',
    end_date: '2036-02-09T15:22:52.961049Z',
    duration_years: 19,
  },
  current_antar: {
    lord: 'venus',
    start_date: '2023-12-01T15:13:52.961049Z',
    end_date: '2027-01-31T06:13:52.961049Z',
    duration_years: 3.1666666666666665,
  },
  current_pratyantar: {
    lord: 'mercury',
    start_date: '2026-06-13T22:25:52.961049Z',
    end_date: '2026-11-24T18:57:22.961049Z',
    duration_years: 0.44861111111111107,
  },
  convention: 'julian_365_25',
};

const HOUSES: SiderealChart['houses'] = Object.fromEntries(
  [
    'Aquarius', 'Pisces', 'Aries', 'Taurus', 'Gemini', 'Cancer',
    'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn',
  ].map((sign, index) => [
    String(index + 1),
    { house: index + 1, longitude: (300 + index * 30) % 360, sign, sign_lord: 'saturn' },
  ]),
);

/** Ascendant 28.82 deg into Aquarius — 1.18 deg short of the Pisces boundary. */
export function nearCuspChart(): SiderealChart {
  return {
    ayanamsa_value: 23.48,
    lagna: {
      longitude: 328.817,
      sign: 'Aquarius',
      sign_degrees: 28.817,
      sign_lord: 'saturn',
      nakshatra: 'Purva Bhadrapada',
      nakshatra_pada: 3,
      nakshatra_lord: 'jupiter',
      lagna_cusp_distance_deg: 1.183,
      lagna_adjacent_sign: 'Pisces',
      is_near_cusp: true,
    },
    planets: PLANETS,
    houses: HOUSES,
    dashas: DASHAS,
    yogas: [HOUSE_YOGA, SIGN_YOGA],
    navamsa: null,
  };
}

/** The control: the same grahas under an ascendant parked mid-Aquarius. */
export function secureLagnaChart(): SiderealChart {
  const near = nearCuspChart();
  return {
    ...near,
    lagna: {
      ...near.lagna,
      longitude: 315,
      sign_degrees: 15,
      lagna_cusp_distance_deg: 15,
      lagna_adjacent_sign: 'Pisces',
      is_near_cusp: false,
    },
  };
}
