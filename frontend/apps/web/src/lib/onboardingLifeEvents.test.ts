import { describe, expect, it } from 'vitest';

import { deterministicallyStructureNarrative } from './onboardingLifeEvents';

describe('deterministicallyStructureNarrative', () => {
  it('separates Spanish dated events without network access', () => {
    const events = deterministicallyStructureNarrative(
      'Me casé en 2015. Cambié de carrera en 2020.',
    );

    expect(events.map((event) => event.category)).toEqual(['marriage', 'career_change']);
  });

  it('separates Portuguese dated events without network access', () => {
    const events = deterministicallyStructureNarrative(
      'Casei em 2015; mudei de carreira em 2020.',
    );

    expect(events.map((event) => event.category)).toEqual(['marriage', 'career_change']);
  });

  it('extracts each dated milestone from a compound narrative sentence', () => {
    const events = deterministicallyStructureNarrative(
      'I got married in June 2015. Then we relocated to Pune in 2019 for work, my first child was born in 2021, and I changed careers in 2023 after finishing a certification.',
    );

    expect(events.map((event) => [event.date, event.category])).toEqual([
      ['2015-01-01', 'marriage'],
      ['2019-01-01', 'relocation'],
      ['2021-01-01', 'childbirth'],
      ['2023-01-01', 'career_change'],
    ]);
  });

  it('keeps the maximum onboarding narrative inside a 50ms parsing budget', () => {
    const event = 'I changed careers in 2020. ';
    const narrative = event.repeat(Math.floor(5000 / event.length)).slice(0, 5000);
    const started = performance.now();

    const events = deterministicallyStructureNarrative(narrative);

    expect(performance.now() - started).toBeLessThan(50);
    expect(events.length).toBeGreaterThan(100);
  });
});
