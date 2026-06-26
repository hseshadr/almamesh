/**
 * Founder-example Vimśottarī fixtures for the period surfaces, in BOTH engine
 * payload shapes: the browser engine's `VimshottariDasha` (raw
 * `sidereal_chart.dashas`, consumed by the Periods explorer + report) and
 * shared-types' `VimshottariDashaData` (the adapted `dasha_ctx`, consumed by
 * the dashboard identity strip).
 *
 * The running stack mirrors the founder example: Saturn mahā 2017→2036 with
 * Venus antar 2023-12-01→2027-01-31 (running; then Sun → 2028-01-13, Moon →
 * 2029-08-13, Mars, Rahu, Jupiter…) and the running Saturn pratyantar ending
 * 2026-06-13, then Mercury → 2026-11-24, Ketu → 2027-01-31.
 *
 * Values are plausible, display-only engine output — nothing here is computed
 * by the app (the UI renders sequences verbatim).
 */

import type { MahaDashaPeriod, VimshottariDasha } from '@almamesh/browser/types';
import type { DashaData, MahaDashaData, VimshottariDashaData } from '@almamesh/shared-types';

type Lord = DashaData['lord'];

/** The canonical Vimśottarī lord wheel (fixture-building order only). */
const WHEEL: readonly Lord[] = [
  'ketu',
  'venus',
  'sun',
  'moon',
  'mars',
  'rahu',
  'jupiter',
  'saturn',
  'mercury',
];

/** ISO date-only string `days` after `iso` (UTC math on date-only values). */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Nine evenly-split, wheel-ordered antar rows for a fixture mahā — plausible
 * filler for the non-founder mahās so every tree row is expandable in tests.
 */
function evenAntars(maha: { lord: Lord; start_date: string; end_date: string }): DashaData[] {
  const startIndex = WHEEL.indexOf(maha.lord);
  const totalDays = Math.round(
    (Date.parse(`${maha.end_date}T00:00:00Z`) - Date.parse(`${maha.start_date}T00:00:00Z`)) /
      86_400_000,
  );
  const step = Math.floor(totalDays / 9);
  return Array.from({ length: 9 }, (_, i) => ({
    lord: WHEEL[(startIndex + i) % 9] as Lord,
    start_date: addDays(maha.start_date, i * step),
    end_date: i === 8 ? maha.end_date : addDays(maha.start_date, (i + 1) * step),
    level: 'antar' as const,
    duration_years: Number(((i === 8 ? totalDays - 8 * step : step) / 365.25).toFixed(4)),
  }));
}

/** The Saturn mahā's nine antar-daśās — the founder example, verbatim dates. */
export const SATURN_ANTARS: readonly DashaData[] = [
  { lord: 'saturn', start_date: '2017-01-09', end_date: '2020-01-13', level: 'antar', duration_years: 3.0083 },
  { lord: 'mercury', start_date: '2020-01-13', end_date: '2022-09-21', level: 'antar', duration_years: 2.6917 },
  { lord: 'ketu', start_date: '2022-09-21', end_date: '2023-12-01', level: 'antar', duration_years: 1.1083 },
  { lord: 'venus', start_date: '2023-12-01', end_date: '2027-01-31', level: 'antar', duration_years: 3.1667 },
  { lord: 'sun', start_date: '2027-01-31', end_date: '2028-01-13', level: 'antar', duration_years: 0.95 },
  { lord: 'moon', start_date: '2028-01-13', end_date: '2029-08-13', level: 'antar', duration_years: 1.5833 },
  { lord: 'mars', start_date: '2029-08-13', end_date: '2030-09-21', level: 'antar', duration_years: 1.1083 },
  { lord: 'rahu', start_date: '2030-09-21', end_date: '2033-07-29', level: 'antar', duration_years: 2.85 },
  { lord: 'jupiter', start_date: '2033-07-29', end_date: '2036-01-31', level: 'antar', duration_years: 2.5333 },
];

/** The running Venus antar's nine pratyantar-daśās (Saturn PD is running). */
export const VENUS_PRATYANTARS: readonly DashaData[] = [
  { lord: 'venus', start_date: '2023-12-01', end_date: '2024-06-12', level: 'pratyantar', duration_years: 0.5278 },
  { lord: 'sun', start_date: '2024-06-12', end_date: '2024-08-07', level: 'pratyantar', duration_years: 0.1583 },
  { lord: 'moon', start_date: '2024-08-07', end_date: '2024-11-11', level: 'pratyantar', duration_years: 0.2639 },
  { lord: 'mars', start_date: '2024-11-11', end_date: '2025-01-17', level: 'pratyantar', duration_years: 0.1847 },
  { lord: 'rahu', start_date: '2025-01-17', end_date: '2025-07-09', level: 'pratyantar', duration_years: 0.475 },
  { lord: 'jupiter', start_date: '2025-07-09', end_date: '2025-12-10', level: 'pratyantar', duration_years: 0.4222 },
  { lord: 'saturn', start_date: '2025-12-10', end_date: '2026-06-13', level: 'pratyantar', duration_years: 0.5014 },
  { lord: 'mercury', start_date: '2026-06-13', end_date: '2026-11-24', level: 'pratyantar', duration_years: 0.4486 },
  { lord: 'ketu', start_date: '2026-11-24', end_date: '2027-01-31', level: 'pratyantar', duration_years: 0.1847 },
];

interface MahaSpec {
  readonly lord: Lord;
  readonly start_date: string;
  readonly end_date: string;
  readonly duration_years: number;
}

const MAHA_SPECS: readonly MahaSpec[] = [
  { lord: 'sun', start_date: '1960-01-09', end_date: '1966-01-09', duration_years: 6 },
  { lord: 'moon', start_date: '1966-01-09', end_date: '1976-01-09', duration_years: 10 },
  { lord: 'mars', start_date: '1976-01-09', end_date: '1983-01-09', duration_years: 7 },
  { lord: 'rahu', start_date: '1983-01-09', end_date: '2001-01-09', duration_years: 18 },
  { lord: 'jupiter', start_date: '2001-01-09', end_date: '2017-01-09', duration_years: 16 },
  { lord: 'saturn', start_date: '2017-01-09', end_date: '2036-01-31', duration_years: 19 },
  { lord: 'mercury', start_date: '2036-01-31', end_date: '2053-01-31', duration_years: 17 },
  { lord: 'ketu', start_date: '2053-01-31', end_date: '2060-01-31', duration_years: 7 },
  { lord: 'venus', start_date: '2060-01-31', end_date: '2080-01-31', duration_years: 20 },
];

/** The nine mahā rows, each carrying its nine dated antar-daśās. */
export const FOUNDER_MAHA_ROWS: readonly MahaDashaPeriod[] = MAHA_SPECS.map((maha) => ({
  ...maha,
  antar_sequence: maha.lord === 'saturn' ? SATURN_ANTARS : evenAntars(maha),
}));

const CURRENT_MAHA = {
  lord: 'saturn',
  start_date: '2017-01-09',
  end_date: '2036-01-31',
  duration_years: 19,
} as const;
const CURRENT_ANTAR = {
  lord: 'venus',
  start_date: '2023-12-01',
  end_date: '2027-01-31',
  duration_years: 3.1667,
} as const;
const CURRENT_PD = {
  lord: 'saturn',
  start_date: '2025-12-10',
  end_date: '2026-06-13',
  duration_years: 0.5014,
} as const;

/** The founder example as the raw `sidereal_chart.dashas` payload. */
export const FOUNDER_DASHAS: VimshottariDasha = {
  maha_dasha_sequence: FOUNDER_MAHA_ROWS,
  current_maha: CURRENT_MAHA,
  current_antar: CURRENT_ANTAR,
  current_pratyantar: CURRENT_PD,
  convention: 'gregorian_365_2425',
  pratyantar_sequence: VENUS_PRATYANTARS,
};

/** An OLDER payload: same current legs, NO depth fields (absent-state path). */
export const FOUNDER_DASHAS_NO_DEPTH: VimshottariDasha = {
  maha_dasha_sequence: MAHA_SPECS.map((maha) => ({ ...maha })),
  current_maha: CURRENT_MAHA,
  current_antar: CURRENT_ANTAR,
  current_pratyantar: CURRENT_PD,
  convention: 'gregorian_365_2425',
};

const FULL_SEQUENCE_CTX: MahaDashaData[] = MAHA_SPECS.map((maha) => ({
  ...maha,
  level: 'maha' as const,
  antar_sequence: maha.lord === 'saturn' ? [...SATURN_ANTARS] : evenAntars(maha),
}));

/** The founder example as the adapted `dasha_ctx` (identity-strip shape). */
export const FOUNDER_DASHA_CTX: VimshottariDashaData = {
  maha_dasha: { ...CURRENT_MAHA, level: 'maha' },
  antar_dasha: { ...CURRENT_ANTAR, level: 'antar' },
  pratyantar_dasha: { ...CURRENT_PD, level: 'pratyantar' },
  full_sequence: FULL_SEQUENCE_CTX,
  convention: 'gregorian_365_2425',
  pratyantar_sequence: [...VENUS_PRATYANTARS],
};
