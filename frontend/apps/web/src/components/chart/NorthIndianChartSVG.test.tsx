import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { buildChartGeometry, buildVargaGeometry } from '@almamesh/store';
import type { PlanetPosition, SiderealChart } from '@almamesh/browser/types';

import { NorthIndianChartSVG } from './NorthIndianChartSVG';
import { ChartStyleToggle } from './ChartStyleToggle';

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
      is_combust: true,
      combustion_separation_deg: 2.5,
      dignity: 'debilitated',
    }),
    moon: planet({
      name: 'moon',
      longitude: 115.0,
      sign: 'Cancer',
      sign_degrees: 25.0,
      sign_lord: 'moon',
      house: 2,
      dignity: 'own_sign',
    }),
    mars: planet({
      name: 'mars',
      longitude: 12.0,
      sign: 'Aries',
      sign_degrees: 12.0,
      sign_lord: 'mars',
      house: 11,
      dignity: 'own_sign',
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
  navamsa: null,
};

describe('NorthIndianChartSVG', () => {
  const geometry = buildChartGeometry(FIXTURE);

  it('renders all 12 house cells as polygons', () => {
    const { container } = render(<NorthIndianChartSVG geometry={geometry} />);
    expect(container.querySelectorAll('polygon')).toHaveLength(12);
  });

  it('renders a known planet label with its degree readout', () => {
    render(<NorthIndianChartSVG geometry={geometry} />);
    // Sun in Cancer 10.5° → "Su 10°"; retrograde adds the "(R)" mark BETWEEN
    // the abbreviation and the degree (label · (R) · degree) with clear spacing
    // so the mark never collides with the degree value in the cell.
    expect(screen.getByText('Su (R) 10°')).toBeTruthy();
    expect(screen.getByText('Ma 12°')).toBeTruthy();
  });

  it('marks the lagna house with the "La" glyph', () => {
    render(<NorthIndianChartSVG geometry={geometry} />);
    expect(screen.getByText('La')).toBeTruthy();
  });

  it('fires onSelectPlanet with the planet key when a planet is clicked', () => {
    const onSelect = vi.fn();
    render(<NorthIndianChartSVG geometry={geometry} onSelectPlanet={onSelect} />);
    fireEvent.click(screen.getByText('Ma 12°'));
    expect(onSelect).toHaveBeenCalledWith('mars');
  });

  it('toggles selection off when the already-selected planet is clicked', () => {
    const onSelect = vi.fn();
    render(
      <NorthIndianChartSVG geometry={geometry} selectedPlanet="mars" onSelectPlanet={onSelect} />,
    );
    fireEvent.click(screen.getByText('Ma 12°'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('defaults to the dark screen theme (cells keep the obsidian fill)', () => {
    const { container } = render(<NorthIndianChartSVG geometry={geometry} />);
    const fills = Array.from(container.querySelectorAll('polygon')).map((c) =>
      c.getAttribute('fill'),
    );
    // The screen variant keeps the dark cell fill; never the cream paper fill.
    expect(fills).toContain('#11151F');
    expect(fills).not.toContain('#FFFFFF');
  });

  it('applies the light paper theme when variant="paper"', () => {
    const { container } = render(<NorthIndianChartSVG geometry={geometry} variant="paper" />);
    // Outer frame + cells use white/cream fills, dark-slate grid strokes.
    const frame = container.querySelector('rect');
    expect(frame?.getAttribute('fill')).toBe('#FFFFFF');
    const cells = container.querySelectorAll('polygon');
    // A non-lagna cell renders white; no cell keeps the dark navy fill.
    const fills = Array.from(cells).map((c) => c.getAttribute('fill'));
    expect(fills).toContain('#FFFFFF');
    expect(fills).not.toContain('#11151F');
    // The lagna cell carries the gold paper tint.
    expect(fills).toContain('#FEF3C7');
    // Dark grid stroke is visible on white.
    expect(frame?.getAttribute('stroke')).toBe('#4B5563');
  });

  it('renders planet labels in dark ink on paper (legible on white)', () => {
    render(<NorthIndianChartSVG geometry={geometry} variant="paper" />);
    // Mars accent (#C84A3A) is already dark enough — passes through unchanged.
    const mars = screen.getByText('Ma 12°');
    expect(mars.getAttribute('fill')).toBe('#C84A3A');
    // The silver Moon accent (#D8D4C6) is too pale on white → darkened toward ink.
    const moon = screen.getByText(/^Mo /);
    expect(moon.getAttribute('fill')).not.toBe('#D8D4C6');
    expect(moon.getAttribute('fill')).not.toBe('#FFFFFF');
  });
});

describe('NorthIndianChartSVG — sign-precision varga (D9)', () => {
  // A varga is a sign-placement chart: the engine emits NO in-varga longitudes,
  // so the diamond must show bare glyphs — never a fabricated "0°".
  const vargaGeometry = buildVargaGeometry({
    name: 'D9',
    lagna_sign: 'Gemini',
    lagna_sign_lord: 'mercury',
    planets: {
      sun: { name: 'sun', sign: 'Capricorn', sign_lord: 'saturn' },
      mars: { name: 'mars', sign: 'Aries', sign_lord: 'mars' },
    },
  });

  it('renders varga planets as bare glyphs with NO degree text', () => {
    const { container } = render(<NorthIndianChartSVG geometry={vargaGeometry} />);
    expect(screen.getByText('Su')).toBeTruthy();
    expect(screen.getByText('Ma')).toBeTruthy();
    expect(container.textContent).not.toContain('°');
  });

  it('keeps real degree readouts on the degree-precision D1 rasi', () => {
    const { container } = render(
      <NorthIndianChartSVG geometry={buildChartGeometry(FIXTURE)} />,
    );
    expect(container.textContent).toContain('°');
  });
});

describe('ChartStyleToggle', () => {
  it('renders North and South options', () => {
    render(<ChartStyleToggle />);
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getByText('North')).toBeTruthy();
    expect(within(tablist).getByText('South')).toBeTruthy();
  });

  it('switches displayStyle when an option is clicked', () => {
    render(<ChartStyleToggle />);
    fireEvent.click(screen.getByText('North'));
    expect(screen.getByText('North').getAttribute('aria-selected')).toBe('true');
  });
});
