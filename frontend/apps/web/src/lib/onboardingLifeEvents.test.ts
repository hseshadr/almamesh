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

  it('keeps the maximum onboarding narrative inside a 50ms parsing budget', () => {
    const event = 'I changed careers in 2020. ';
    const narrative = event.repeat(Math.floor(5000 / event.length)).slice(0, 5000);
    const started = performance.now();

    const events = deterministicallyStructureNarrative(narrative);

    expect(performance.now() - started).toBeLessThan(50);
    expect(events.length).toBeGreaterThan(100);
  });
});
