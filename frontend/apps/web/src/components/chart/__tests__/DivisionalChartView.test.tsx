import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useChartStore } from '@almamesh/store';
import type { NavamsaChart, SiderealChart } from '@almamesh/browser/types';

import { DivisionalChartView } from '../DivisionalChartView';

// The view reads ONLY `chart.navamsa`; the rest of SiderealChart is irrelevant
// to it, so a minimal D9 fixture is enough (Title-Case signs as the engine emits).
const NAVAMSA: NavamsaChart = {
  name: 'D9',
  lagna_sign: 'Gemini',
  lagna_sign_lord: 'mercury',
  planets: {
    sun: { name: 'sun', sign: 'Capricorn', sign_lord: 'saturn' },
    // Moon is combust in D1; the engine carries that flag onto the navamsa.
    moon: { name: 'moon', sign: 'Scorpio', sign_lord: 'mars', is_combust: true },
    jupiter: { name: 'jupiter', sign: 'Sagittarius', sign_lord: 'jupiter' },
  },
};

// Minimal chart carrying just the navamsa (cast at this test boundary).
const chart = { navamsa: NAVAMSA } as unknown as SiderealChart;

describe('DivisionalChartView (D9 Navamsa)', () => {
  it('renders the D9 panel and a kundli SVG when navamsa is present', () => {
    render(<DivisionalChartView siderealChart={chart} />);
    expect(screen.getByTestId('divisional-chart-d9')).toBeTruthy();
    // The title is i18n'd; with no i18next instance bound in this unit test,
    // react-i18next renders the translation KEY verbatim.
    expect(screen.getByText('varga.d9_title')).toBeTruthy();
    // The chart renderers (North/South) expose an img role on the SVG.
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('renders nothing when the engine emitted no navamsa (guard, no empty table)', () => {
    const noNavamsa = { navamsa: null } as unknown as SiderealChart;
    const { container } = render(<DivisionalChartView siderealChart={noNavamsa} />);
    expect(container.childElementCount).toBe(0);
  });

  it('renders nothing when there is no chart at all', () => {
    const { container } = render(<DivisionalChartView siderealChart={null} />);
    expect(container.childElementCount).toBe(0);
  });

  it('defaults to the dark screen theme (no cream paper fills present)', () => {
    const { container } = render(<DivisionalChartView siderealChart={chart} />);
    const fills = Array.from(container.querySelectorAll('rect, polygon')).map((el) =>
      el.getAttribute('fill'),
    );
    expect(fills).not.toContain('#FFFFFF');
    expect(fills).not.toContain('#FBF7EE');
  });

  it('forwards variant="paper" to the underlying kundli renderer', () => {
    const { container } = render(<DivisionalChartView siderealChart={chart} variant="paper" />);
    // Whichever style is active, the kundli SVG must carry a paper fill.
    const fills = Array.from(container.querySelectorAll('rect, polygon')).map((el) =>
      el.getAttribute('fill'),
    );
    expect(fills.some((f) => f === '#FFFFFF' || f === '#FBF7EE')).toBe(true);
    // No dark observatory fills leak into the paper variant.
    expect(fills).not.toContain('#0B0E17');
    expect(fills).not.toContain('#11151F');
  });

  it('renders NO degree text in either style — the engine emits sign placements only', () => {
    // A D9 placement has no within-sign longitude; a fabricated "0°00'" is the
    // exact red flag an expert reads as a calculation bug.
    for (const displayStyle of ['north', 'south'] as const) {
      useChartStore.setState({ displayStyle });
      const { container, unmount } = render(<DivisionalChartView siderealChart={chart} />);
      expect(container.textContent).not.toContain('°');
      unmount();
    }
  });

  it('dims a graha the engine flagged combust in D1 (regression: was full-opacity in every varga)', () => {
    // Combustion is a D1 fact the engine carries onto the D9; the varga path
    // used to drop it, so a combust graha rendered full-opacity in the navamsa.
    // The North SVG marks a combust planet's glyph with opacity-50.
    useChartStore.setState({ displayStyle: 'north' });
    const { container } = render(<DivisionalChartView siderealChart={chart} />);
    const moon = container.querySelector('[data-planet="moon"]');
    const jupiter = container.querySelector('[data-planet="jupiter"]');
    expect(moon?.getAttribute('class')).toContain('opacity-50');
    expect(jupiter?.getAttribute('class')).not.toContain('opacity-50');
  });

  it('labels the South plate centre as the D9, not the D1 Rāśi', () => {
    useChartStore.setState({ displayStyle: 'south' });
    render(<DivisionalChartView siderealChart={chart} />);
    expect(screen.getByTestId('south-chart-center-code').textContent).toBe('D9');
    expect(screen.getByTestId('south-chart-center-title').textContent).not.toBe('Rāśi');
  });
});
