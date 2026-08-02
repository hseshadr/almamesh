/**
 * reportFixtures — a maximal, shared on-screen report state.
 *
 * Extracted from `pages/__tests__/ReportView.test.tsx` so the report-section
 * parity guard (`lib/__tests__/reportSectionParity.test.tsx`) drives the SAME
 * chart the report tests use. One fixture, two suites — a fixture that drifts
 * between them would quietly weaken the guard.
 */

import type { SiderealChart } from '@almamesh/browser/types';
import type { VedicInterpretation } from '@almamesh/shared-types';
import type { StoredChart } from '@almamesh/store';

export const CHART: SiderealChart = {
  ayanamsa_value: 23.86,
  lagna: {
    longitude: 5.4,
    sign: 'Aries',
    sign_degrees: 5.4,
    sign_lord: 'mars',
    nakshatra: 'Ashwini',
    nakshatra_pada: 2,
    nakshatra_lord: 'ketu',
  },
  planets: {
    sun: {
      name: 'sun',
      longitude: 100.5,
      latitude: 0,
      distance: 1,
      speed: 1,
      is_retrograde: false,
      sign: 'Cancer',
      sign_degrees: 10.5,
      sign_lord: 'moon',
      nakshatra: 'Pushya',
      nakshatra_pada: 1,
      nakshatra_lord: 'saturn',
      house: 4,
      dignity: 'neutral',
      is_combust: false,
      combustion_separation_deg: null,
      houses_ruled: [2],
      is_yogakaraka: false,
    },
    mars: {
      name: 'mars',
      longitude: 280.5,
      latitude: 0,
      distance: 1,
      speed: 0.5,
      is_retrograde: true,
      sign: 'Scorpio',
      sign_degrees: 12.6833,
      sign_lord: 'mars',
      nakshatra: 'Anuradha',
      nakshatra_pada: 3,
      nakshatra_lord: 'saturn',
      house: 8,
      dignity: 'own_sign',
      is_combust: true,
      combustion_separation_deg: 4.2,
      houses_ruled: [1, 8],
      is_yogakaraka: false,
    },
  },
  houses: Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => {
      const sign = [
        'Aries',
        'Taurus',
        'Gemini',
        'Cancer',
        'Leo',
        'Virgo',
        'Libra',
        'Scorpio',
        'Sagittarius',
        'Capricorn',
        'Aquarius',
        'Pisces',
      ][i];
      return [String(i + 1), { house: i + 1, longitude: i * 30, sign, sign_lord: 'mars' }];
    }),
  ) as SiderealChart['houses'],
  dashas: {
    maha_dasha_sequence: [
      { lord: 'venus', start_date: '1985-01-01', end_date: '2005-01-01', duration_years: 20 },
      { lord: 'sun', start_date: '2005-01-01', end_date: '2011-01-01', duration_years: 6 },
      { lord: 'moon', start_date: '2011-01-01', end_date: '2021-01-01', duration_years: 10 },
    ],
    current_maha: { lord: 'moon', start_date: '2011-01-01', end_date: '2021-01-01', duration_years: 10 },
    current_antar: { lord: 'jupiter', start_date: '2018-01-01', end_date: '2019-06-01', duration_years: 1.4 },
    current_pratyantar: null,
  },
  yogas: [
    {
      name: 'Gaja-Kesari Yoga',
      display_name: 'Gaja-Kesari Yoga (Jupiter in a kendra from the Moon)',
      category: 'auspicious',
      description: 'Moon and Jupiter in mutual kendra — wisdom and prosperity.',
      effects: 'Renown and respect.',
      grade: 'moderate',
      strength_factors: [
        {
          factor_type: 'dignity',
          planet: 'jupiter',
          value: 'exalted',
          basis: 'Sign dignity per the BPHS exaltation/own-sign doctrine',
        },
      ],
      planets_involved: ['moon', 'jupiter'],
      houses_involved: [1, 4],
      planetary_signature: 'jupiter_moon_h1_h4',
      formation_rules: [
        {
          rule: 'chandra.gaja_kesari',
          description: 'Jupiter in a kendra from the Moon',
          source: 'BPHS, Chandra-yoga adhyaya',
          planets: ['moon', 'jupiter'],
          houses: [1, 4],
        },
      ],
    },
    {
      name: 'Vipareeta Raja Yoga',
      display_name: 'Vipareeta Raja Yoga (Harsha: the 6th lord in the 8th)',
      category: 'raja',
      description: 'The 6th lord placed in a dusthana.',
      effects: 'Gains through adversity.',
      grade: 'weak',
      strength_factors: [
        {
          factor_type: 'house_class',
          planet: 'mars',
          value: 'dusthana (house 8)',
          basis: 'Whole-sign house class from the lagna (kendra/trikona/upachaya/dusthana)',
        },
      ],
      planets_involved: ['mars'],
      houses_involved: [6, 8],
      planetary_signature: 'mars_h6_h8',
      formation_rules: [
        {
          rule: 'vipareeta.harsha',
          description: 'The 6th lord Mars placed in the 8th (dusthana)',
          source: 'Phaladeepika, Vipareeta Raja-yoga adhyaya',
          planets: ['mars'],
          houses: [6, 8],
        },
      ],
    },
  ],
  navamsa: {
    name: 'D9',
    lagna_sign: 'Leo',
    lagna_sign_lord: 'sun',
    planets: {
      sun: { name: 'sun', sign: 'Aries', sign_lord: 'mars' },
      mars: { name: 'mars', sign: 'Capricorn', sign_lord: 'saturn' },
    },
  },
};

export const FULL_INTERPRETATION: VedicInterpretation = {
  summary: {
    layman: 'A balanced chart with strong drive.',
    technical: 'A balanced chart: exalted Mars in the 8th drives transformation.',
  },
  strengths: [
    { title: 'Determination', layman: 'You push through hard things.', technical: 'Exalted Mars in the 8th lends grit.' },
  ],
  challenges: [
    { title: 'Impatience', layman: 'You can rush decisions.', technical: 'Retrograde Mars suggests revisited aggression.' },
  ],
  life_themes: [
    { title: 'Transformation', layman: 'Reinvention is your lifelong arc.', technical: '8th-house emphasis signals deep change.' },
  ],
  integrated_yoga_narrative: {
    layman: 'Your yogas point to recognition.',
    technical: 'Gaja-Kesari fortifies the lagna axis.',
  },
  health_guidance: { layman: 'Mind your energy.', technical: 'Watch Mars-ruled inflammation.' },
  career_guidance: { layman: 'You lead well.', technical: 'Tenth-lord placement favors authority.' },
  relationship_guidance: null,
  remedial_measures: { layman: 'Practice patience daily.', technical: 'Mars mantra on Tuesdays.' },
};

export function storedChart(): StoredChart {
  return {
    chart_id: 'chart-1',
    profile_id: 'chart-1',
    person_name: 'Asha Rao',
    is_primary: true,
    birth_data: {
      birth_datetime_utc: '1990-03-30T06:30:00Z',
      birth_datetime_local: '1990-03-30T12:00:00',
      birth_location_details: {
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        latitude: 12.97,
        longitude: 77.59,
        timezone: 'Asia/Kolkata',
      },
    },
    astronomical_calculations: {
      sidereal_ctx: {
        julian_day: 0,
        ayanamsa_value: 23.86,
        ayanamsa_type: 'lahiri',
        house_system: 'whole_sign',
        sidereal_time: 0,
        lagna: {},
        planets: {},
      },
      calculation_timestamp: '1990-03-30T06:30:00Z',
      software_version: 'test',
    },
    sidereal_chart: CHART,
  } as StoredChart;
}
