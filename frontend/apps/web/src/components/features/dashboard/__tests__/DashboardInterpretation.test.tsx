import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { VedicInterpretation } from '@almamesh/shared-types';

import '../../../../i18n/config';
import { DashboardInterpretation } from '../DashboardInterpretation';

/**
 * A SYNTHETIC full reading — no real birth data. Every persona carries a
 * distinct `layman` vs `technical` string so voice selection is observable, and
 * every optional section is populated so we can prove each one renders.
 */
function fullInterpretation(): VedicInterpretation {
  return {
    summary: { layman: 'Summary you.', technical: 'Summary technical.' },
    strengths: [
      { title: 'Resolute Will', layman: 'You persevere.', technical: 'Mars in the 1st house.' },
    ],
    challenges: [
      { title: 'Restless Mind', layman: 'You overthink.', technical: 'Moon–Rahu conjunction.' },
    ],
    life_themes: [
      { title: 'Service', layman: 'You serve others.', technical: '6th-lord in the 10th.' },
    ],
    integrated_yoga_narrative: {
      layman: 'A rare uplifting pattern.',
      technical: 'Gaja-Kesari yoga is formed.',
    },
    health_guidance: { layman: 'Rest well.', technical: 'Watch the 6th house.' },
    education_guidance: { layman: 'Keep learning.', technical: 'Mercury dignity supports study.' },
    career_guidance: { layman: 'Lead teams.', technical: '10th-lord is strong.' },
    relationship_guidance: { layman: 'Be patient.', technical: '7th house afflicted.' },
    finances_guidance: { layman: 'Save steadily.', technical: '2nd-lord well placed.' },
    spiritual_guidance: { layman: 'Meditate daily.', technical: 'Ketu in the 12th.' },
    life_evolution_guidance: { layman: 'You grow slowly.', technical: 'Saturn maturation.' },
    remedial_measures: { layman: 'Chant on Tuesdays.', technical: 'Propitiate Mars.' },
    upcoming_periods: [
      { title: 'Jupiter Period', layman: 'Growth ahead.', technical: 'Jupiter mahadasha begins.' },
    ],
    current_period_guidance: null,
  };
}

/** A minimal reading: summary + strengths only, every optional section absent. */
function minimalInterpretation(): VedicInterpretation {
  return {
    summary: { layman: 'Summary you.', technical: 'Summary technical.' },
    strengths: [
      { title: 'Resolute Will', layman: 'You persevere.', technical: 'Mars in the 1st.' },
    ],
    challenges: [],
    life_themes: [],
  };
}

describe('DashboardInterpretation', () => {
  it('renders the core narrative (strengths, challenges, life themes) always visible', () => {
    render(<DashboardInterpretation interpretation={fullInterpretation()} audience="you" />);

    expect(screen.getByTestId('dashboard-strengths')).toBeTruthy();
    expect(screen.getByTestId('dashboard-challenges')).toBeTruthy();
    expect(screen.getByTestId('dashboard-life-themes')).toBeTruthy();
    // Item title + prose surface for the selected voice.
    expect(screen.getByText('Resolute Will')).toBeTruthy();
    expect(screen.getByText('You persevere.')).toBeTruthy();
  });

  it('renders every present optional section as a collapsible', () => {
    render(<DashboardInterpretation interpretation={fullInterpretation()} audience="you" />);

    expect(screen.getByTestId('dashboard-yogas')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-health')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-relationship')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-career')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-education')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-finances')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-spiritual')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-life_evolution')).toBeTruthy();
    expect(screen.getByTestId('dashboard-guidance-remedial')).toBeTruthy();
    expect(screen.getByTestId('dashboard-road-ahead')).toBeTruthy();
  });

  it('starts every collapsible closed (trigger aria-expanded=false)', () => {
    render(<DashboardInterpretation interpretation={fullInterpretation()} audience="you" />);

    const yogas = within(screen.getByTestId('dashboard-yogas')).getByRole('button');
    expect(yogas.getAttribute('aria-expanded')).toBe('false');

    const career = within(screen.getByTestId('dashboard-guidance-career')).getByRole('button');
    expect(career.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a collapsible in place on click', () => {
    render(<DashboardInterpretation interpretation={fullInterpretation()} audience="you" />);

    const trigger = within(screen.getByTestId('dashboard-yogas')).getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('omits sections that are null/empty (no hollow headings)', () => {
    render(<DashboardInterpretation interpretation={minimalInterpretation()} audience="you" />);

    expect(screen.getByTestId('dashboard-strengths')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-challenges')).toBeNull();
    expect(screen.queryByTestId('dashboard-life-themes')).toBeNull();
    expect(screen.queryByTestId('dashboard-yogas')).toBeNull();
    expect(screen.queryByTestId('dashboard-guidance-health')).toBeNull();
    expect(screen.queryByTestId('dashboard-guidance-career')).toBeNull();
    expect(screen.queryByTestId('dashboard-road-ahead')).toBeNull();
  });

  it('renders the layman voice for audience="you"', () => {
    render(<DashboardInterpretation interpretation={fullInterpretation()} audience="you" />);

    expect(screen.getByText('You persevere.')).toBeTruthy();
    expect(screen.getByText('A rare uplifting pattern.')).toBeTruthy();
    expect(screen.queryByText('Mars in the 1st house.')).toBeNull();
    expect(screen.queryByText('Gaja-Kesari yoga is formed.')).toBeNull();
  });

  it('renders the technical voice for audience="astrologer"', () => {
    render(<DashboardInterpretation interpretation={fullInterpretation()} audience="astrologer" />);

    expect(screen.getByText('Mars in the 1st house.')).toBeTruthy();
    expect(screen.getByText('Gaja-Kesari yoga is formed.')).toBeTruthy();
    expect(screen.queryByText('You persevere.')).toBeNull();
    expect(screen.queryByText('A rare uplifting pattern.')).toBeNull();
  });
});
