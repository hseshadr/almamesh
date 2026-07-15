/**
 * buildNarrative — current_sky ("What's Active Now & Next", Spec 065).
 *
 * The PDF's structured-interpretation narrative gains a current_sky section
 * mirroring the existing "The Road Ahead" (upcoming_periods) pattern: a
 * titled-persona list resolved to the requested audience's voice, dropped
 * entirely when absent/empty so a natal-only reading (no predictive data)
 * renders exactly as before (honesty fence: never invent timing).
 */
import { describe, it, expect } from 'vitest';
import type { VedicInterpretation } from '@almamesh/shared-types';
import { buildNarrative } from '../buildReportSections';

const BASE: VedicInterpretation = {
  summary: { layman: 'A chart of patient ambition.', technical: 'A chart of patient ambition.' },
  strengths: [{ title: 'Endurance', layman: 'You last.', technical: 'Strong Saturn.' }],
  challenges: [],
  life_themes: [],
};

describe('buildNarrative — current_sky', () => {
  it('includes a titled current_sky section, resolved to the requested voice', () => {
    const interpretation: VedicInterpretation = {
      ...BASE,
      current_sky: [
        {
          title: 'Saturn Antardasha',
          layman: 'A steady, building phase.',
          technical: 'Saturn antardasha within Jupiter mahadasha.',
        },
      ],
    };
    const sections = buildNarrative(interpretation, 'you');
    const currentSky = sections.find((s) => s.paragraphs.some((p) => p.includes('Saturn Antardasha')));
    expect(currentSky).toBeDefined();
    expect(currentSky?.paragraphs.join(' ')).toContain('A steady, building phase.');
    expect(currentSky?.paragraphs.join(' ')).not.toContain('Saturn antardasha within Jupiter mahadasha.');
  });

  it('renders the technical voice for the astrologer audience', () => {
    const interpretation: VedicInterpretation = {
      ...BASE,
      current_sky: [
        { title: 'Saturn Antardasha', layman: 'Plain words.', technical: 'Saturn antardasha within Jupiter mahadasha.' },
      ],
    };
    const sections = buildNarrative(interpretation, 'astrologer');
    const currentSky = sections.find((s) => s.paragraphs.some((p) => p.includes('Saturn Antardasha')));
    expect(currentSky?.paragraphs.join(' ')).toContain('Saturn antardasha within Jupiter mahadasha.');
  });

  it('is absent when current_sky is null (honesty fence: never invent timing)', () => {
    const sections = buildNarrative({ ...BASE, current_sky: null }, 'you');
    expect(sections.some((s) => s.paragraphs.some((p) => p.includes('Saturn')))).toBe(false);
  });

  it('is absent for an OLD stored reading without the field (no crash, no hollow section)', () => {
    const sections = buildNarrative(BASE, 'you');
    expect(sections.length).toBeGreaterThan(0); // summary + strengths still build
    expect(sections.some((s) => s.title === "What's Active Now & Next")).toBe(false);
  });
});
