/**
 * dashaPeriods — pure list-lookup + unit-conversion helpers behind the period
 * surfaces. NO astrology: "next" is literally the row after the current one in
 * an engine-emitted sequence, and durations re-express the engine's
 * `duration_years` float. Fixtures mirror the founder example: Saturn mahā
 * 2017→2036, Venus antar 2023-12-01→2027-01-31 (running), Saturn pratyantar
 * ending 2026-06-13, then Mercury → 2026-11-24, Ketu → 2027-01-31.
 */

import { describe, it, expect } from 'vitest';

import {
  durationParts,
  findPeriodRow,
  nextAntar,
  nextPeriodRow,
  nextPratyantar,
  type DashaTreeRow,
} from '../dashaPeriods';

/** The Saturn mahā's nine antar-daśās (founder example, engine-shaped). */
const SATURN_ANTARS: readonly DashaTreeRow[] = [
  { lord: 'saturn', start_date: '2017-01-09', end_date: '2020-01-13', duration_years: 3.0083 },
  { lord: 'mercury', start_date: '2020-01-13', end_date: '2022-09-21', duration_years: 2.6917 },
  { lord: 'ketu', start_date: '2022-09-21', end_date: '2023-12-01', duration_years: 1.1083 },
  { lord: 'venus', start_date: '2023-12-01', end_date: '2027-01-31', duration_years: 3.1667 },
  { lord: 'sun', start_date: '2027-01-31', end_date: '2028-01-13', duration_years: 0.95 },
  { lord: 'moon', start_date: '2028-01-13', end_date: '2029-08-13', duration_years: 1.5833 },
  { lord: 'mars', start_date: '2029-08-13', end_date: '2030-09-21', duration_years: 1.1083 },
  { lord: 'rahu', start_date: '2030-09-21', end_date: '2033-07-29', duration_years: 2.85 },
  { lord: 'jupiter', start_date: '2033-07-29', end_date: '2036-01-31', duration_years: 2.5333 },
];

/** The Venus antar's nine pratyantar-daśās; Saturn (index 6) is running. */
const VENUS_PRATYANTARS: readonly DashaTreeRow[] = [
  { lord: 'venus', start_date: '2023-12-01', end_date: '2024-06-12', duration_years: 0.5278 },
  { lord: 'sun', start_date: '2024-06-12', end_date: '2024-08-07', duration_years: 0.1583 },
  { lord: 'moon', start_date: '2024-08-07', end_date: '2024-11-11', duration_years: 0.2639 },
  { lord: 'mars', start_date: '2024-11-11', end_date: '2025-01-17', duration_years: 0.1847 },
  { lord: 'rahu', start_date: '2025-01-17', end_date: '2025-07-09', duration_years: 0.475 },
  { lord: 'jupiter', start_date: '2025-07-09', end_date: '2025-12-10', duration_years: 0.4222 },
  { lord: 'saturn', start_date: '2025-12-10', end_date: '2026-06-13', duration_years: 0.5014 },
  { lord: 'mercury', start_date: '2026-06-13', end_date: '2026-11-24', duration_years: 0.4486 },
  { lord: 'ketu', start_date: '2026-11-24', end_date: '2027-01-31', duration_years: 0.1847 },
];

const JUPITER_MAHA: DashaTreeRow = {
  lord: 'jupiter',
  start_date: '2001-01-09',
  end_date: '2017-01-09',
  duration_years: 16,
  antar_sequence: [
    { lord: 'jupiter', start_date: '2001-01-09', end_date: '2003-02-26', duration_years: 2.1333 },
    // …abridged: helpers only need ordered rows, not all nine.
    { lord: 'rahu', start_date: '2014-06-19', end_date: '2017-01-09', duration_years: 2.4 },
  ],
};

const SATURN_MAHA: DashaTreeRow = {
  lord: 'saturn',
  start_date: '2017-01-09',
  end_date: '2036-01-31',
  duration_years: 19,
  antar_sequence: SATURN_ANTARS,
};

const MERCURY_MAHA: DashaTreeRow = {
  lord: 'mercury',
  start_date: '2036-01-31',
  end_date: '2053-01-31',
  duration_years: 17,
  antar_sequence: [
    { lord: 'mercury', start_date: '2036-01-31', end_date: '2038-06-29', duration_years: 2.4083 },
    { lord: 'ketu', start_date: '2038-06-29', end_date: '2039-06-26', duration_years: 0.9917 },
  ],
};

const MAHAS: readonly DashaTreeRow[] = [JUPITER_MAHA, SATURN_MAHA, MERCURY_MAHA];

const CURRENT_MAHA = { lord: 'saturn', start_date: '2017-01-09' };
const CURRENT_ANTAR = { lord: 'venus', start_date: '2023-12-01' };
const CURRENT_PD = { lord: 'saturn', start_date: '2025-12-10' };

describe('findPeriodRow / nextPeriodRow (pure list lookup)', () => {
  it('finds a row by lord + start_date', () => {
    expect(findPeriodRow(SATURN_ANTARS, CURRENT_ANTAR)?.end_date).toBe('2027-01-31');
  });

  it('returns null when the leg is absent from the sequence', () => {
    expect(findPeriodRow(SATURN_ANTARS, { lord: 'venus', start_date: '1990-01-01' })).toBeNull();
    expect(findPeriodRow(undefined, CURRENT_ANTAR)).toBeNull();
    expect(findPeriodRow(SATURN_ANTARS, null)).toBeNull();
  });

  it('returns the row immediately after the current one', () => {
    expect(nextPeriodRow(SATURN_ANTARS, CURRENT_ANTAR)?.lord).toBe('sun');
    expect(nextPeriodRow(SATURN_ANTARS, CURRENT_ANTAR)?.start_date).toBe('2027-01-31');
  });

  it('returns null past the end of the sequence', () => {
    expect(nextPeriodRow(SATURN_ANTARS, { lord: 'jupiter', start_date: '2033-07-29' })).toBeNull();
  });
});

describe('nextAntar (founder example)', () => {
  it('Venus antar running → next antar is Sun from 2027-01-31', () => {
    const next = nextAntar(MAHAS, CURRENT_MAHA, CURRENT_ANTAR);
    expect(next?.lord).toBe('sun');
    expect(next?.start_date).toBe('2027-01-31');
  });

  it('rolls into the next mahā when the running antar is the last one', () => {
    const next = nextAntar(MAHAS, CURRENT_MAHA, { lord: 'jupiter', start_date: '2033-07-29' });
    expect(next?.lord).toBe('mercury');
    expect(next?.start_date).toBe('2036-01-31');
  });

  it('returns null at the end of the final mahā (honest, no invention)', () => {
    const next = nextAntar(MAHAS, { lord: 'mercury', start_date: '2036-01-31' }, {
      lord: 'ketu',
      start_date: '2038-06-29',
    });
    expect(next).toBeNull();
  });

  it('returns null when depth is absent (older payload without antar_sequence)', () => {
    const bare: readonly DashaTreeRow[] = [
      { lord: 'saturn', start_date: '2017-01-09', end_date: '2036-01-31', duration_years: 19 },
    ];
    expect(nextAntar(bare, CURRENT_MAHA, CURRENT_ANTAR)).toBeNull();
  });

  it('returns null when there is no current antar', () => {
    expect(nextAntar(MAHAS, CURRENT_MAHA, null)).toBeNull();
  });
});

describe('nextPratyantar (founder example)', () => {
  it('Saturn PD running → next is Mercury from 2026-06-13', () => {
    const next = nextPratyantar(VENUS_PRATYANTARS, CURRENT_PD);
    expect(next?.lord).toBe('mercury');
    expect(next?.start_date).toBe('2026-06-13');
  });

  it('then Ketu until 2027-01-31, and null past the antar boundary', () => {
    const ketu = nextPratyantar(VENUS_PRATYANTARS, { lord: 'mercury', start_date: '2026-06-13' });
    expect(ketu?.lord).toBe('ketu');
    expect(ketu?.end_date).toBe('2027-01-31');
    expect(nextPratyantar(VENUS_PRATYANTARS, { lord: 'ketu', start_date: '2026-11-24' })).toBeNull();
  });

  it('returns null when the engine emitted no pratyantar sequence', () => {
    expect(nextPratyantar(null, CURRENT_PD)).toBeNull();
    expect(nextPratyantar(undefined, CURRENT_PD)).toBeNull();
  });
});

describe('durationParts (pure unit re-expression of engine duration_years)', () => {
  it('whole years stay whole', () => {
    expect(durationParts(19)).toEqual({ years: 19, months: 0, days: 0 });
  });

  it('fractional years split into years + months', () => {
    expect(durationParts(3.1667)).toEqual({ years: 3, months: 2, days: 0 });
  });

  it('sub-year spans render as months', () => {
    expect(durationParts(0.95)).toEqual({ years: 0, months: 11, days: 0 });
    expect(durationParts(0.5014)).toEqual({ years: 0, months: 6, days: 0 });
  });

  it('sub-month spans render as days', () => {
    expect(durationParts(0.04)).toEqual({ years: 0, months: 0, days: 15 });
  });

  it('rolls 12 months up into a year', () => {
    expect(durationParts(2.96)).toEqual({ years: 3, months: 0, days: 0 });
  });

  it('degrades non-finite/negative input to zero (never NaN on screen)', () => {
    expect(durationParts(Number.NaN)).toEqual({ years: 0, months: 0, days: 0 });
    expect(durationParts(-1)).toEqual({ years: 0, months: 0, days: 0 });
  });
});
