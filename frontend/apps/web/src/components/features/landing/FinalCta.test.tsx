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
import { FinalCta } from './FinalCta';

const mockHasLocalChart = vi.mocked(hasLocalChart);

function renderFinalCta() {
  return render(
    <MemoryRouter>
      <FinalCta />
    </MemoryRouter>,
  );
}

describe('FinalCta', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
    mockHasLocalChart.mockReturnValue(false);
  });

  describe('adaptive CTA', () => {
    it('routes a first-time visitor to /onboarding with the generate label', () => {
      renderFinalCta();
      const cta = screen.getByTestId('final-cta');
      expect(cta.getAttribute('href')).toBe('/onboarding');
      expect(cta.textContent).toContain('Generate my chart — free');
    });

    it('routes a returning visitor straight to /dashboard with the returning label', () => {
      mockHasLocalChart.mockReturnValue(true);
      renderFinalCta();
      const cta = screen.getByTestId('final-cta');
      expect(cta.getAttribute('href')).toBe('/dashboard');
      expect(cta.textContent).toContain('Open my chart');
    });
  });

  it('links to the source with an inline octocat SVG', () => {
    renderFinalCta();
    const source = screen.getByRole('link', { name: /view source on github/i });
    expect(source.getAttribute('href')).toBe(GITHUB_URL);
    expect(source.querySelector('svg')).toBeTruthy();
  });
});
