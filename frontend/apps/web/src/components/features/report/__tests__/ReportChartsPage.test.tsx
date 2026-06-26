/**
 * ReportChartsPage — the printed D1 Rāśi + D9 Navāṁśa plates.
 *
 * Credibility contract: the D1 plate carries real engine degrees; the D9 plate
 * is a SIGN-placement chart (the engine emits no in-varga longitudes), so it
 * must print NO degree text at all — a fabricated "0°00'" is the exact red
 * flag an expert reads as a calculation bug.
 *
 * i18n note: no i18next instance is bound in this unit test, so react-i18next
 * renders translation KEYS verbatim — assertions therefore target testids,
 * SVG planet labels and the degree glyph, never prose.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import { useChartStore } from '@almamesh/store';
import type { PlanetPosition, SiderealChart } from '@almamesh/browser/types';

import { ReportChartsPage } from '../ReportChartsPage';

// --- Fixture (mirrors the shape used by chartGeometry.test.ts) --------------
function planet(overrides: Partial<PlanetPosition> & { name: string }): PlanetPosition {
  return {
    longitude: 0,
    latitude: 0,
    distance: 1,
    speed: 1,
    is_retrograde: false,
    sign: 'Aries',
    sign_degrees: 0,
    sign_lord: 'mars',
    nakshatra: 'Ashwini',
    nakshatra_pada: 1,
    nakshatra_lord: 'ketu',
    house: 1,
    dignity: 'neutral',
    is_combust: false,
    combustion_separation_deg: null,
    houses_ruled: [],
    is_yogakaraka: false,
    ...overrides,
  };
}

const FIXTURE: SiderealChart = {
  ayanamsa_value: 23.5,
  lagna: {
    longitude: 65.4,
    sign: 'Gemini',
    sign_degrees: 5.4,
    sign_lord: 'mercury',
    nakshatra: 'Mrigashira',
    nakshatra_pada: 3,
    nakshatra_lord: 'mars',
  },
  planets: {
    sun: planet({
      name: 'sun',
      longitude: 100.5,
      sign: 'Cancer',
      sign_degrees: 10.5,
      sign_lord: 'moon',
      house: 2,
      is_retrograde: true,
    }),
    mars: planet({
      name: 'mars',
      longitude: 12.0,
      sign: 'Aries',
      sign_degrees: 12.0,
      sign_lord: 'mars',
      house: 11,
    }),
  },
  houses: {
    '1': { house: 1, longitude: 60, sign: 'Gemini', sign_lord: 'mercury' },
    '2': { house: 2, longitude: 90, sign: 'Cancer', sign_lord: 'moon' },
    '3': { house: 3, longitude: 120, sign: 'Leo', sign_lord: 'sun' },
    '4': { house: 4, longitude: 150, sign: 'Virgo', sign_lord: 'mercury' },
    '5': { house: 5, longitude: 180, sign: 'Libra', sign_lord: 'venus' },
    '6': { house: 6, longitude: 210, sign: 'Scorpio', sign_lord: 'mars' },
    '7': { house: 7, longitude: 240, sign: 'Sagittarius', sign_lord: 'jupiter' },
    '8': { house: 8, longitude: 270, sign: 'Capricorn', sign_lord: 'saturn' },
    '9': { house: 9, longitude: 300, sign: 'Aquarius', sign_lord: 'saturn' },
    '10': { house: 10, longitude: 330, sign: 'Pisces', sign_lord: 'jupiter' },
    '11': { house: 11, longitude: 0, sign: 'Aries', sign_lord: 'mars' },
    '12': { house: 12, longitude: 30, sign: 'Taurus', sign_lord: 'venus' },
  },
  dashas: {
    maha_dasha_sequence: [],
    current_maha: null,
    current_antar: null,
    current_pratyantar: null,
  },
  yogas: [],
  navamsa: {
    name: 'D9',
    lagna_sign: 'Scorpio',
    lagna_sign_lord: 'mars',
    planets: {
      sun: { name: 'sun', sign: 'Capricorn', sign_lord: 'saturn' },
      jupiter: { name: 'jupiter', sign: 'Pisces', sign_lord: 'jupiter' },
    },
  },
};

/** The two framed kundli plates, in DOM order: [D1 rasi, D9 navamsa]. */
function plates(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('figure.report-chart-figure'));
}

describe('ReportChartsPage — D1 keeps degrees, D9 shows sign placements only', () => {
  beforeEach(() => {
    useChartStore.setState({ displayStyle: 'south' });
  });

  it('renders both plates: the D1 rasi and the D9 navamsa', () => {
    const { container } = render(<ReportChartsPage chart={FIXTURE} />);
    expect(plates(container)).toHaveLength(2);
  });

  it('keeps real engine degree readouts on the D1 plate', () => {
    const { container } = render(<ReportChartsPage chart={FIXTURE} />);
    const [d1] = plates(container);
    // Sun at Cancer 10.5° → "10°30'" on the South grid.
    expect(within(d1).getByText("10°30'")).toBeTruthy();
  });

  it('prints NO degree text on the D9 plate (engine emits sign placements only)', () => {
    const { container } = render(<ReportChartsPage chart={FIXTURE} />);
    const d9 = plates(container)[1];
    expect(within(d9).getByText('Su')).toBeTruthy();
    expect(d9.textContent).not.toContain('°');
  });

  it('labels each South plate centre with its own chart, never "Rāśi · D1" on the D9', () => {
    const { container } = render(<ReportChartsPage chart={FIXTURE} />);
    const [d1, d9] = plates(container);
    expect(within(d1).getByTestId('south-chart-center-code').textContent).toBe('D1');
    expect(within(d9).getByTestId('south-chart-center-code').textContent).toBe('D9');
    expect(within(d9).getByTestId('south-chart-center-title').textContent).not.toBe('Rāśi');
  });

  it('renders honestly in the North style too: D1 degrees stay, D9 has none', () => {
    useChartStore.setState({ displayStyle: 'north' });
    const { container } = render(<ReportChartsPage chart={FIXTURE} />);
    const [d1, d9] = plates(container);
    expect(within(d1).getByText('Su (R) 10°')).toBeTruthy();
    expect(d9.textContent).not.toContain('°');
  });
});
