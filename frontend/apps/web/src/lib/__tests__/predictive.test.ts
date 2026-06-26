import { describe, it, expect, beforeEach } from 'vitest';
import { useLanguageStore } from '@almamesh/store';
import type { ProcessedBirthData } from '@almamesh/shared-types';
import {
  buildEnsurePredictiveInput,
  formatPredictiveDate,
  predictiveReferenceInstant,
  titleCaseToken,
  toVargaChart,
} from '../predictive';
import { VARGA_CTX_FULL } from '../../test/predictiveFixtures';

const BIRTH: ProcessedBirthData = {
  birth_datetime_utc: '1990-01-15T12:00:00+00:00',
  birth_datetime_local: '1990-01-15T07:00:00',
  birth_location_details: {
    city: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
  },
};

describe('predictiveReferenceInstant', () => {
  it('pins to UTC midnight of the given day', () => {
    expect(predictiveReferenceInstant(new Date('2026-06-09T18:45:12Z'))).toBe(
      '2026-06-09T00:00:00Z',
    );
  });
});

describe('buildEnsurePredictiveInput', () => {
  it('builds the full lazy-compute input from stored birth data', () => {
    const input = buildEnsurePredictiveInput('profile-1', BIRTH, '2026-06-09T00:00:00Z');
    expect(input).toEqual({
      profileKey: 'profile-1',
      datetimeUtc: '1990-01-15T12:00:00+00:00',
      latitude: 40.7128,
      longitude: -74.006,
      referenceInstant: '2026-06-09T00:00:00Z',
    });
  });

  it('returns null when birth data is missing (no silent guesses)', () => {
    expect(buildEnsurePredictiveInput('p', undefined, '2026-06-09T00:00:00Z')).toBeNull();
  });
});

describe('toVargaChart', () => {
  it('Title-Cases the adapter lowercase signs for the geometry builder', () => {
    const d9 = VARGA_CTX_FULL.charts.D9;
    expect(d9).toBeDefined();
    const chart = toVargaChart(d9!);
    expect(chart.name).toBe('D9');
    expect(chart.lagna_sign).toBe('Scorpio');
    expect(chart.planets.saturn).toEqual({
      name: 'saturn',
      sign: 'Aquarius',
      sign_lord: 'saturn',
    });
  });
});

describe('formatPredictiveDate', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders a date-only ISO as that calendar date (never rolled via UTC)', () => {
    expect(formatPredictiveDate('2026-10-26')).toContain('2026');
    expect(formatPredictiveDate('2026-10-26')).toContain('26');
  });

  it('renders a full instant without throwing', () => {
    expect(formatPredictiveDate('2026-09-12T04:00:00Z')).toContain('2026');
  });
});

describe('titleCaseToken', () => {
  it('capitalizes a lowercase engine token', () => {
    expect(titleCaseToken('saturn')).toBe('Saturn');
    expect(titleCaseToken('')).toBe('');
  });
});
