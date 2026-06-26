import { afterEach, describe, expect, it } from 'vitest';
import { useLanguageStore } from '@almamesh/store';
import type { ProcessedBirthData } from '@almamesh/shared-types';

import { rectificationDelta, rectificationDeltaFromClocks } from './rectification';

// The display formatters read the active UI locale from the store; restore 'en'
// after every test so the en-US 12-hour assertions below hold.
afterEach(() => {
  useLanguageStore.setState({ language: 'en' });
});

/** Minimal ProcessedBirthData carrying just the fields the helper reads. */
function birth(
  local: string,
  original: string | undefined,
): ProcessedBirthData {
  // The helper reads only `birth_datetime_local` + `birth_time_original`; the
  // location is a synthetic stub (Bengaluru) just to satisfy the type.
  return {
    birth_datetime_utc: '',
    birth_datetime_local: local,
    birth_location_details: {
      city: 'Bengaluru',
      latitude: 12.9716,
      longitude: 77.5946,
      timezone: 'Asia/Kolkata',
    },
    ...(original ? { birth_time_original: original } : {}),
  } as ProcessedBirthData;
}

describe('rectificationDelta', () => {
  it('returns null when no rectification was applied (no original time)', () => {
    expect(rectificationDelta(birth('1990-01-15T05:45:00', undefined))).toBeNull();
  });

  it('returns null when the original equals the effective time', () => {
    expect(rectificationDelta(birth('1990-01-15T05:45:00', '05:45'))).toBeNull();
  });

  it('computes a forward (+) delta for 05:45 -> 06:00', () => {
    const result = rectificationDelta(birth('1990-01-15T06:00:00', '05:45'));
    expect(result).not.toBeNull();
    expect(result?.deltaMinutes).toBe(15);
    // en-US renders a 12-hour clock for these.
    expect(result?.enteredLabel).toBe('5:45 AM');
    expect(result?.rectifiedLabel).toBe('6:00 AM');
  });

  it('computes a backward (-) delta for 06:00 -> 05:30', () => {
    const result = rectificationDelta(birth('1990-01-15T05:30:00', '06:00'));
    expect(result?.deltaMinutes).toBe(-30);
    expect(result?.enteredLabel).toBe('6:00 AM');
    expect(result?.rectifiedLabel).toBe('5:30 AM');
  });

  it('formats the time labels in the active locale (es -> 24-hour)', () => {
    useLanguageStore.setState({ language: 'es' });
    const result = rectificationDelta(birth('1990-01-15T18:00:00', '17:45'));
    expect(result?.deltaMinutes).toBe(15);
    expect(result?.enteredLabel).toBe('17:45');
    expect(result?.rectifiedLabel).toBe('18:00');
  });

  it('reads only the HH:MM of the effective clock (ignores seconds)', () => {
    const result = rectificationDelta(birth('1990-01-15T06:00:30', '05:45'));
    expect(result?.deltaMinutes).toBe(15);
  });
});

// The shared core: compares two raw `HH:MM` form clocks (entered → rectified)
// directly, so the ProfileSettings form panel and `rectificationDelta` produce
// the SAME minutes + locale-formatted labels from one implementation.
describe('rectificationDeltaFromClocks', () => {
  it('computes a forward (+15 min) delta for 05:45 -> 06:00', () => {
    const result = rectificationDeltaFromClocks('05:45', '06:00');
    expect(result).not.toBeNull();
    expect(result?.deltaMinutes).toBe(15);
    // en-US renders a 12-hour clock for these.
    expect(result?.enteredLabel).toBe('5:45 AM');
    expect(result?.rectifiedLabel).toBe('6:00 AM');
  });

  it('returns null when the two clocks are equal (no adjustment to show)', () => {
    expect(rectificationDeltaFromClocks('05:45', '05:45')).toBeNull();
  });

  it('computes a delta across an hour boundary (05:50 -> 06:10 = +20 min)', () => {
    const result = rectificationDeltaFromClocks('05:50', '06:10');
    expect(result?.deltaMinutes).toBe(20);
    expect(result?.enteredLabel).toBe('5:50 AM');
    expect(result?.rectifiedLabel).toBe('6:10 AM');
  });
});
