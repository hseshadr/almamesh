import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLanguageStore } from '@almamesh/store';

import '../../../i18n/config';

vi.mock('../../../providers/chartEngineContext', () => ({
  useChartEngine: () => ({ startBootstrap: () => {} }),
  useOptionalChartEngine: () => null,
}));

// happy-dom has no WebGL; stub the lazy force-field scene.
vi.mock('../../forcefield', () => ({
  ForceFieldExperience: () => <div data-testid="forcefield-stub" />,
}));

import { Hero } from './Hero';

function renderHero() {
  return render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>,
  );
}

describe('Hero', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders the approved headline', () => {
    renderHero();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Your real sky. Computed on your device. Free, forever.',
      }),
    ).toBeTruthy();
  });

  it('renders the CTA as a link to /onboarding', () => {
    renderHero();
    expect(screen.getByTestId('hero-cta').getAttribute('href')).toBe('/onboarding');
  });

  it('renders the microcopy', () => {
    renderHero();
    expect(screen.getByText(/Works offline · 3 languages · open engine\./i)).toBeTruthy();
  });
});
