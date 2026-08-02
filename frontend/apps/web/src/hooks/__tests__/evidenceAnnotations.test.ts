/**
 * The evidence-annotation request seam.
 *
 * Two properties matter here and neither is about prose quality:
 *   1. the model is offered the ENGINE's observation ids and the ENGINE's
 *      citable-factor allowlist — never a second list assembled for the prompt;
 *   2. the prompt's statement/evidence strings are derived mechanically from the
 *      computed factor, so nothing interpretive is smuggled in as "evidence".
 */
import { describe, expect, it } from 'vitest';

import type { SiderealChart } from '@almamesh/browser/types';
import type { ProviderConfig } from '@almamesh/llm';

import { buildObservationPrompts, canRequestEvidenceAnnotations } from '../evidenceAnnotations';

const CHART = {
  ayanamsa_value: 23.4,
  lagna: { sign: 'Aries', sign_degrees: 14.2 },
  planets: {
    venus: {
      sign: 'Virgo',
      sign_degrees: 8.5,
      nakshatra: 'Hasta',
      nakshatra_pada: 2,
      dignity: 'debilitated',
      house: 6,
      houses_ruled: [2, 7],
      is_yogakaraka: false,
      is_combust: false,
      combustion_separation_deg: 12.4,
      is_retrograde: false,
      speed: 1.1,
    },
  },
  houses: {},
  yogas: [],
  dashas: {
    convention: 'vimshottari',
    current_maha: {
      lord: 'saturn',
      start_date: '2020-01-01',
      end_date: '2039-01-01',
      duration_years: 19,
    },
    maha_dasha_sequence: [
      { lord: 'saturn', start_date: '2020-01-01', end_date: '2039-01-01', duration_years: 19 },
    ],
  },
} as unknown as SiderealChart;

const LOCAL_DEFAULT: ProviderConfig = {
  engine: 'openai-http',
  model: 'llama3.1',
  privacyMode: 'local_only',
  baseUrl: 'http://localhost:11434/v1',
};

const CONFIGURED: ProviderConfig = {
  engine: 'openai-http',
  model: 'deepseek/deepseek-v4-pro',
  privacyMode: 'cloud_premium',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'test-key',
};

describe('canRequestEvidenceAnnotations', () => {
  it('refuses the unconfigured local_only default — no key means no call', () => {
    expect(canRequestEvidenceAnnotations(LOCAL_DEFAULT)).toBe(false);
  });

  it('allows a deliberately configured provider', () => {
    expect(canRequestEvidenceAnnotations(CONFIGURED)).toBe(true);
  });
});

describe('buildObservationPrompts', () => {
  it('offers the engine observation ids, not a list assembled for the prompt', () => {
    const { observations } = buildObservationPrompts(CHART);
    const ids = observations.map((o) => o.id);

    expect(ids).toContain('lagna');
    expect(ids).toContain('dignity:venus');
    expect(ids).toContain('dasha:maha:saturn');
    // A neutral/absent condition is NOT an observation: Venus is not combust.
    expect(ids).not.toContain('combustion:venus');
  });

  it('offers every citable factor as the allowlist — a superset of the observations', () => {
    const { observations, factorIds } = buildObservationPrompts(CHART);

    expect(factorIds).toContain('position:venus');
    expect(factorIds).toContain('house:venus');
    expect(factorIds).toContain('combustion:venus');
    expect(factorIds.length).toBeGreaterThan(observations.length);
  });

  it('derives statement and evidence from the computed values, mechanically', () => {
    const { observations } = buildObservationPrompts(CHART);
    const dignity = observations.find((o) => o.id === 'dignity:venus');
    const dasha = observations.find((o) => o.id === 'dasha:maha:saturn');

    expect(dignity?.statement).toBe('venus debilitated in Virgo');
    // The measured degrees are in the evidence, and so is the supporting position.
    expect(dignity?.evidence).toContain('8.50');
    expect(dignity?.evidence).toContain('position:venus');
    expect(dignity?.evidence).toContain('Hasta');

    expect(dasha?.statement).toContain('saturn');
    expect(dasha?.evidence).toContain('2020-01-01');
    expect(dasha?.evidence).toContain('2039-01-01');
  });

  it('produces a non-empty statement and evidence for every observation', () => {
    const { observations } = buildObservationPrompts(CHART);

    expect(observations.length).toBeGreaterThan(0);
    for (const observation of observations) {
      expect(observation.statement.trim().length).toBeGreaterThan(0);
      expect(observation.evidence.trim().length).toBeGreaterThan(0);
    }
  });
});
