/**
 * ReportInterpretation — the written reading in ONE audience's voice; the new
 * sixth AI section `upcoming_periods` ("The Road Ahead") renders its dated
 * period windows as titled items with the same grammar as the other blocks,
 * and OLD stored readings (without the field) must render untouched — never
 * crash, never show a hollow heading.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useLanguageStore } from '@almamesh/store';
import type { VedicInterpretation } from '@almamesh/shared-types';

import '../../../../i18n/config';
import { ReportInterpretation } from '../ReportInterpretation';

const BASE: VedicInterpretation = {
  summary: { layman: 'A chart of patient ambition.', technical: 'A chart of patient ambition.' },
  strengths: [{ title: 'Endurance', layman: 'You last.', technical: 'Strong Saturn.' }],
  challenges: [],
  life_themes: [],
  career_guidance: { layman: 'You build slowly and well.', technical: '10th-lord Saturn rewards tenure.' },
};

describe('ReportInterpretation — The Road Ahead (upcoming_periods)', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the dated windows in the layman voice for the "you" audience', () => {
    const interpretation: VedicInterpretation = {
      ...BASE,
      upcoming_periods: [
        {
          title: 'Mercury pratyantar · from Jun 13, 2026',
          layman: 'Communication sharpens; sign things carefully.',
          technical: 'Sa/Ve/Me from 2026-06-13; Budha karyesha of the 5th.',
        },
        {
          title: 'Sun antar · from Jan 31, 2027',
          layman: 'Visibility rises.',
          technical: 'Sūrya antardaśā activates the 10th.',
        },
      ],
    };
    render(<ReportInterpretation interpretation={interpretation} audience="you" />);
    const section = screen.getByTestId('report-road-ahead');
    expect(section.textContent).toContain('The Road Ahead');
    expect(section.textContent).toContain('Mercury pratyantar · from Jun 13, 2026');
    expect(section.textContent).toContain('Communication sharpens');
    expect(section.textContent).toContain('Sun antar · from Jan 31, 2027');
    expect(section.textContent).not.toContain('Budha karyesha');
  });

  it('renders the technical voice for the astrologer audience', () => {
    const interpretation: VedicInterpretation = {
      ...BASE,
      upcoming_periods: [
        { title: 'Mercury pratyantar', layman: 'Plain words.', technical: 'Budha karyesha of the 5th.' },
      ],
    };
    render(<ReportInterpretation interpretation={interpretation} audience="astrologer" />);
    expect(screen.getByTestId('report-road-ahead').textContent).toContain('Budha karyesha');
  });

  it('OLD stored readings without the field render fine and skip the section', () => {
    render(<ReportInterpretation interpretation={BASE} audience="you" />);
    expect(screen.getByTestId('report-interpretation')).toBeTruthy();
    expect(screen.getByTestId('report-guidance-career')).toBeTruthy();
    expect(screen.queryByTestId('report-road-ahead')).toBeNull();
    expect(screen.queryByText('The Road Ahead')).toBeNull();
  });

  it('skips the section when items carry no text (no hollow heading)', () => {
    const interpretation: VedicInterpretation = {
      ...BASE,
      upcoming_periods: [{ title: 'Empty window' }],
    };
    render(<ReportInterpretation interpretation={interpretation} audience="you" />);
    expect(screen.queryByTestId('report-road-ahead')).toBeNull();
  });
});
