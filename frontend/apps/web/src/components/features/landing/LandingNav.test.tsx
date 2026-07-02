import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLanguageStore } from '@almamesh/store';

import '../../../i18n/config';

vi.mock('../../../providers/chartEngineContext', () => ({
  useChartEngine: () => ({ startBootstrap: () => {} }),
  useOptionalChartEngine: () => null,
}));

vi.mock('../../../lib/localChart', () => ({
  hasLocalChart: vi.fn(() => false),
}));

import { hasLocalChart } from '../../../lib/localChart';
import { GITHUB_URL } from './LandingFooter';
import { LandingNav } from './LandingNav';

const mockHasLocalChart = vi.mocked(hasLocalChart);

function renderNav() {
  return render(
    <MemoryRouter>
      <LandingNav />
    </MemoryRouter>,
  );
}

describe('LandingNav', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    mockHasLocalChart.mockReturnValue(false);
  });

  describe('open-source GitHub link (goodwill signal)', () => {
    it('points at the canonical repository', () => {
      renderNav();
      expect(screen.getByTestId('landing-nav-github').getAttribute('href')).toBe(GITHUB_URL);
    });

    it('is visible on ALL breakpoints (not hidden below sm)', () => {
      renderNav();
      // Regression guard against the old `hidden ... sm:inline-flex` treatment.
      const link = screen.getByTestId('landing-nav-github');
      expect(link.className).not.toContain('hidden');
    });

    it('renders a real inline octocat SVG (no external icon CDN)', () => {
      renderNav();
      expect(screen.getByTestId('landing-nav-github').querySelector('svg')).toBeTruthy();
    });
  });

  describe('adaptive CTA', () => {
    it('routes a first-time visitor to /onboarding with the generate label', () => {
      renderNav();
      const cta = screen.getByTestId('landing-nav-cta');
      expect(cta.getAttribute('href')).toBe('/onboarding');
      expect(cta.textContent).toContain('Generate my chart');
    });

    it('routes a returning visitor straight to /dashboard with the returning label', () => {
      mockHasLocalChart.mockReturnValue(true);
      renderNav();
      const cta = screen.getByTestId('landing-nav-cta');
      expect(cta.getAttribute('href')).toBe('/dashboard');
      expect(cta.textContent).toContain('Open my chart');
    });
  });
});
