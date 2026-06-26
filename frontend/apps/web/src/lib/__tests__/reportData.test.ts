import { afterEach, describe, expect, it } from 'vitest';
import { useLanguageStore } from '@almamesh/store';
import type { ProcessedBirthData } from '@almamesh/shared-types';

import {
  buildPlaceString,
  formatBirthDateTime,
  formatDegree,
  formatDurationYears,
  formatReportDate,
  selectTechnicalFields,
} from '../reportData';

// The report date/birth formatters now follow the active UI language; reset to
// English after each test so the default-locale assertions hold.
afterEach(() => {
  useLanguageStore.setState({ language: 'en' });
});

// --- formatReportDate -------------------------------------------------------
describe('formatReportDate', () => {
  it('formats a valid Date in the active locale (en default → "Month D, YYYY")', () => {
    expect(formatReportDate(new Date('2026-06-05T12:00:00Z'))).toBe('June 5, 2026');
  });

  it('formats a valid ISO string', () => {
    expect(formatReportDate('2026-06-05T09:30:00Z')).toBe('June 5, 2026');
  });

  it('localizes the report date to the chosen UI language (es → day-first)', () => {
    useLanguageStore.setState({ language: 'es' });
    const out = formatReportDate('2026-06-05T09:30:00Z');
    // es-ES is day-first; the long month is Spanish ("junio"), year 2026.
    expect(out).toContain('5');
    expect(out).toContain('2026');
    expect(out.toLowerCase()).toContain('junio');
  });

  it('does NOT render the epoch "1969"/"1970" for 0 — falls back to a real date', () => {
    const out = formatReportDate(0);
    expect(out).not.toContain('1969');
    expect(out).not.toContain('1970');
    expect(out).not.toMatch(/invalid/i);
    // The fallback is the current date, so its year is the present year.
    expect(out).toContain(String(new Date().getFullYear()));
  });

  it('falls back for null without producing the epoch or "Invalid Date"', () => {
    const out = formatReportDate(null);
    expect(out).not.toContain('1969');
    expect(out).not.toMatch(/invalid/i);
    expect(out).toContain(String(new Date().getFullYear()));
  });

  it('falls back for undefined without producing the epoch or "Invalid Date"', () => {
    const out = formatReportDate(undefined);
    expect(out).not.toContain('1969');
    expect(out).not.toMatch(/invalid/i);
    expect(out).toContain(String(new Date().getFullYear()));
  });

  it('falls back for an unparseable string', () => {
    const out = formatReportDate('not-a-date');
    expect(out).not.toMatch(/invalid/i);
    expect(out).toContain(String(new Date().getFullYear()));
  });
});

// --- formatBirthDateTime ----------------------------------------------------
function birth(overrides: Partial<ProcessedBirthData> = {}): ProcessedBirthData {
  return {
    birth_datetime_utc: '1988-08-08T01:14:00Z',
    birth_datetime_local: '1988-08-08T06:44:00',
    birth_location_details: {
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      latitude: 12.9716,
      longitude: 77.5946,
      timezone: 'Asia/Kolkata',
    },
    ...overrides,
  };
}

describe('formatBirthDateTime', () => {
  it('formats the stored birth-local wall clock in the birth timezone (no UTC roll)', () => {
    const out = formatBirthDateTime(birth());
    // Reuses lib/dates helpers — birth-local 1988-08-08 06:44 stays as written.
    expect(out.date).toBe('08/08/1988');
    expect(out.time).toBe('6:44 AM');
    expect(out.tzLabel).toBe('Asia/Kolkata');
  });

  it('never silently rolls the calendar date back a day west of GMT', () => {
    const out = formatBirthDateTime(birth());
    expect(out.date).not.toBe('08/07/1988');
  });
});

// --- buildPlaceString -------------------------------------------------------
describe('buildPlaceString', () => {
  it('joins all populated parts with commas', () => {
    expect(buildPlaceString(birth())).toBe('Bengaluru, Karnataka, India');
  });

  it('omits empty state/country — no trailing "Bengaluru, India, ," artefact', () => {
    const out = buildPlaceString(
      birth({
        birth_location_details: {
          city: 'Bengaluru',
          state: '',
          country: '',
          latitude: 12.9716,
          longitude: 77.5946,
          timezone: 'Asia/Kolkata',
        },
      }),
    );
    expect(out).toBe('Bengaluru');
    expect(out).not.toMatch(/,\s*,/);
    expect(out.endsWith(',')).toBe(false);
  });

  it('omits null/whitespace parts and never leaves a trailing comma', () => {
    const out = buildPlaceString(
      birth({
        birth_location_details: {
          city: 'Bengaluru',
          state: null,
          country: '   ',
          latitude: 12.9716,
          longitude: 77.5946,
          timezone: 'Asia/Kolkata',
        },
      }),
    );
    expect(out).toBe('Bengaluru');
    expect(out).not.toMatch(/,\s*$/);
  });
});

// --- formatDegree -----------------------------------------------------------
describe('formatDegree', () => {
  it('renders whole degrees + arcminutes from the fractional part', () => {
    // 0.6833... * 60 ≈ 41 arcmin.
    expect(formatDegree(15.6833333)).toBe('15°41′');
  });

  it('zero-pads arcminutes below ten', () => {
    expect(formatDegree(8.05)).toBe('8°03′');
  });

  it('renders exact-degree values with 00 arcminutes', () => {
    expect(formatDegree(22)).toBe('22°00′');
  });
});

// --- formatDurationYears ----------------------------------------------------
describe('formatDurationYears', () => {
  it('renders an integral span as a bare whole number', () => {
    expect(formatDurationYears(18)).toBe('18');
    expect(formatDurationYears(6)).toBe('6');
  });

  it('collapses a fractional balance span to one decimal (no raw float)', () => {
    // The Venus balance period that printed as "4.329716303220536 yr".
    expect(formatDurationYears(4.329716303220536)).toBe('4.3');
  });

  it('rounds the single decimal place', () => {
    expect(formatDurationYears(7.06)).toBe('7.1');
    expect(formatDurationYears(10.04)).toBe('10.0');
  });

  it('handles zero as a bare "0"', () => {
    expect(formatDurationYears(0)).toBe('0');
  });

  it('degrades non-finite input to "0" rather than "NaN"/"Infinity"', () => {
    expect(formatDurationYears(Number.NaN)).toBe('0');
    expect(formatDurationYears(Number.POSITIVE_INFINITY)).toBe('0');
  });
});

// --- selectTechnicalFields --------------------------------------------------
describe('selectTechnicalFields', () => {
  it('returns ONLY engine-emitted fields (ayanamsa value+type, house system)', () => {
    const fields = selectTechnicalFields({ ayanamsa_value: 23.85 });
    const labels = fields.map((f) => f.label);
    expect(labels).toContain('Ayanamsa');
    expect(labels).toContain('House System');
    // The engine does NOT emit these — they must be omitted (the blank-label bug).
    expect(labels).not.toContain('Julian Day');
    expect(labels).not.toContain('Sidereal Time');
  });

  it('formats the ayanamsa value in degrees with the Lahiri type', () => {
    const fields = selectTechnicalFields({ ayanamsa_value: 23.85 });
    const ayanamsa = fields.find((f) => f.label === 'Ayanamsa');
    expect(ayanamsa?.value).toContain('23.85');
    expect(ayanamsa?.value).toContain('°');
    expect(ayanamsa?.value.toLowerCase()).toContain('lahiri');
  });

  it('reports the whole-sign house system used by the engine', () => {
    const fields = selectTechnicalFields({ ayanamsa_value: 23.85 });
    const houseSystem = fields.find((f) => f.label === 'House System');
    expect(houseSystem?.value.toLowerCase()).toContain('whole');
  });
});
