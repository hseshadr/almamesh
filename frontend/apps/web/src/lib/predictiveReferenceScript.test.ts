import { describe, expect, it } from 'vitest';
import { chartDayReferenceInstant } from '../../scripts/predictiveReference.mjs';
import { predictiveReferenceInstant } from './predictive';

// The live verify-* journeys seed a chart whose referenceDate must equal the key the app
// derives for its predictive request (`predictiveReferenceInstant(now, chart timezone)`).
// Deriving it from the UTC calendar day broke the match whenever the chart's local day
// differed from UTC's — e.g. Asia/Kolkata from 18:30Z to midnight UTC.
describe('chartDayReferenceInstant (verify-* scripts)', () => {
  const cases: Array<[string, string]> = [
    ['2026-09-23T18:29:59Z', 'Asia/Kolkata'],
    ['2026-09-23T18:30:00Z', 'Asia/Kolkata'],
    ['2026-09-23T23:59:59Z', 'Asia/Kolkata'],
    ['2026-09-24T03:00:00Z', 'America/Los_Angeles'],
    ['2026-09-24T12:00:00Z', 'UTC'],
  ];

  it.each(cases)('matches the app key at %s in %s', (iso, timeZone) => {
    const now = new Date(iso);
    expect(chartDayReferenceInstant(timeZone, now)).toBe(predictiveReferenceInstant(now, timeZone));
  });

  it('keys on the chart local day, not the UTC day', () => {
    expect(chartDayReferenceInstant('Asia/Kolkata', new Date('2026-09-23T19:00:00Z'))).toBe(
      '2026-09-24T00:00:00Z',
    );
  });
});
