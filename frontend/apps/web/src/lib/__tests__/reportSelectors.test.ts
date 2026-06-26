import { describe, expect, it } from 'vitest';
import type { VedicInterpretation } from '@almamesh/shared-types';

import {
  buildGuidanceSections,
  personaText,
  resolveReportAudience,
} from '../reportSelectors';

describe('resolveReportAudience', () => {
  it('maps astrologer-ish spellings to "astrologer"', () => {
    expect(resolveReportAudience('astrologer')).toBe('astrologer');
    expect(resolveReportAudience('technical')).toBe('astrologer');
    expect(resolveReportAudience('expert')).toBe('astrologer');
    expect(resolveReportAudience('ASTROLOGER')).toBe('astrologer');
  });

  it('maps layman-ish / unknown / missing values to "you"', () => {
    expect(resolveReportAudience('you')).toBe('you');
    expect(resolveReportAudience('layman')).toBe('you');
    expect(resolveReportAudience('')).toBe('you');
    expect(resolveReportAudience(null)).toBe('you');
    expect(resolveReportAudience(undefined)).toBe('you');
    expect(resolveReportAudience('nonsense')).toBe('you');
  });
});

describe('personaText', () => {
  it('renders the layman voice for the "you" audience', () => {
    expect(personaText({ layman: 'plain words', technical: 'jargon' }, 'you')).toBe('plain words');
  });

  it('renders the technical voice for the "astrologer" audience', () => {
    expect(personaText({ layman: 'plain words', technical: 'jargon' }, 'astrologer')).toBe('jargon');
  });

  it('falls back to the other voice rather than blanking', () => {
    expect(personaText({ technical: 'only technical' }, 'you')).toBe('only technical');
    expect(personaText({ layman: 'only layman' }, 'astrologer')).toBe('only layman');
  });

  it('returns empty string for null/empty personas', () => {
    expect(personaText(null, 'you')).toBe('');
    expect(personaText(undefined, 'astrologer')).toBe('');
    expect(personaText({}, 'you')).toBe('');
  });
});

function interpretation(overrides: Partial<VedicInterpretation> = {}): VedicInterpretation {
  return {
    summary: { layman: 'sum', technical: 'sum' },
    strengths: [],
    challenges: [],
    life_themes: [],
    ...overrides,
  };
}

describe('buildGuidanceSections', () => {
  it('drops sections with no text for the audience', () => {
    const sections = buildGuidanceSections(
      interpretation({
        career_guidance: { layman: 'do work', technical: 'tenth house' },
        health_guidance: null,
        relationship_guidance: { layman: '' },
      }),
      'you',
    );
    const keys = sections.map((s) => s.key);
    expect(keys).toContain('career');
    expect(keys).not.toContain('health');
    expect(keys).not.toContain('relationship');
  });

  it('surfaces the audience-specific voice in each section', () => {
    const [career] = buildGuidanceSections(
      interpretation({ career_guidance: { layman: 'do work', technical: 'tenth house' } }),
      'astrologer',
    );
    expect(career.title).toBe('Career & Professional Life');
    expect(career.text).toBe('tenth house');
  });

  it('orders health before career before remedial measures', () => {
    const sections = buildGuidanceSections(
      interpretation({
        remedial_measures: { layman: 'chant' },
        career_guidance: { layman: 'work' },
        health_guidance: { layman: 'rest' },
      }),
      'you',
    );
    expect(sections.map((s) => s.key)).toEqual(['health', 'career', 'remedial']);
  });
});
