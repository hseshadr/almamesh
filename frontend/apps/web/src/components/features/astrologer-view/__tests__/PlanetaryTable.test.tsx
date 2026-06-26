import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { ChartGeometry, ChartPlanet } from '@almamesh/store';
import { PlanetaryTable } from '../PlanetaryTable';

function planet(overrides: Partial<ChartPlanet> & Pick<ChartPlanet, 'name'>): ChartPlanet {
  return {
    label: 'Su',
    longitude: 12.57,
    sign: 'Aries',
    signIndex: 0,
    signDegrees: 12.57,
    house: 1,
    nakshatra: 'Ashwini',
    pada: 2,
    dignity: 'exalted',
    isRetrograde: false,
    isCombust: false,
    housesRuled: [],
    isYogakaraka: false,
    color: '#E3B85A',
    ...overrides,
  };
}

function buildFixture(): ChartGeometry {
  const planets: ChartPlanet[] = [
    planet({
      name: 'sun',
      label: 'Su',
      dignity: 'exalted',
      signDegrees: 12.57,
      isCombust: false,
      housesRuled: [5],
    }),
    planet({
      name: 'saturn',
      label: 'Sa',
      sign: 'Aries',
      signIndex: 0,
      house: 1,
      dignity: 'debilitated',
      isRetrograde: true,
      signDegrees: 1.0,
      color: '#7E92D6',
      housesRuled: [10, 11],
      isYogakaraka: true,
    }),
    planet({
      name: 'venus',
      label: 'Ve',
      dignity: 'neutral',
      signDegrees: 3.5,
      isCombust: true,
      housesRuled: [2, 7],
    }),
    planet({ name: 'rahu', label: 'Ra', dignity: '', housesRuled: [], signDegrees: 22.1 }),
  ];
  return {
    // The planetary table is the degree-accurate D1 path (real longitudes).
    precision: 'degree',
    lagna: { sign: 'Aries', signIndex: 0, longitude: 5, signDegrees: 5 },
    planets,
    houses: [],
    signs: [],
  };
}

function renderTable(ui: ReactElement): ReturnType<typeof render> {
  // The table carries a quiet router Link to the predictive Strength panel.
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PlanetaryTable', () => {
  it('renders a row per planet with name, degree and dignity', () => {
    renderTable(<PlanetaryTable geometry={buildFixture()} />);
    expect(screen.getByText('sun')).toBeTruthy();
    expect(screen.getByText('saturn')).toBeTruthy();
    expect(screen.getByText("12°34'")).toBeTruthy();
    expect(screen.getByText('Exalted')).toBeTruthy();
    expect(screen.getByText('Debilitated')).toBeTruthy();
  });

  it('shows a retrograde badge for retrograde planets', () => {
    renderTable(<PlanetaryTable geometry={buildFixture()} />);
    const saturnRow = screen.getByText('saturn').closest('tr');
    expect(saturnRow).toBeTruthy();
    expect(within(saturnRow as HTMLElement).getByText('℞')).toBeTruthy();
  });

  it('shows the engine-computed houses ruled, with — for lordless grahas (Rahu/Ketu)', () => {
    renderTable(<PlanetaryTable geometry={buildFixture()} />);
    const saturnRow = screen.getByText('saturn').closest('tr') as HTMLElement;
    expect(within(saturnRow).getByText('10, 11')).toBeTruthy();
    const sunRow = screen.getByText('sun').closest('tr') as HTMLElement;
    expect(within(sunRow).getByText('5')).toBeTruthy();
    const rahuRow = screen.getByText('rahu').closest('tr') as HTMLElement;
    // Rahu lords no sign in the Parashari scheme: an honest em-dash, not a 0.
    expect(within(rahuRow).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('marks the engine-flagged yogakaraka', () => {
    renderTable(<PlanetaryTable geometry={buildFixture()} />);
    const saturnRow = screen.getByText('saturn').closest('tr') as HTMLElement;
    expect(within(saturnRow).getByLabelText('planetary.yogakaraka_aria')).toBeTruthy();
    const sunRow = screen.getByText('sun').closest('tr') as HTMLElement;
    expect(within(sunRow).queryByLabelText('planetary.yogakaraka_aria')).toBeNull();
  });

  it('marks combustion from the engine flag', () => {
    renderTable(<PlanetaryTable geometry={buildFixture()} />);
    const venusRow = screen.getByText('venus').closest('tr') as HTMLElement;
    expect(within(venusRow).getByLabelText('planetary.combust_aria')).toBeTruthy();
    const sunRow = screen.getByText('sun').closest('tr') as HTMLElement;
    expect(within(sunRow).queryByLabelText('planetary.combust_aria')).toBeNull();
  });

  it('renders NO per-planet strength numbers (the stub Shadbala column is gone)', () => {
    const { container } = renderTable(<PlanetaryTable geometry={buildFixture()} />);
    expect(screen.queryByText('tables.shadbala')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/7\.25/);
  });

  it('points quietly to the real strength panel (/predictive)', () => {
    renderTable(<PlanetaryTable geometry={buildFixture()} />);
    const pointer = screen.getByText('planetary.strength_pointer');
    expect(pointer).toBeTruthy();
    const link = screen.getByRole('link', { name: 'planetary.strength_pointer_link' });
    expect(link.getAttribute('href')).toBe('/predictive');
  });

  it('renders an empty state when no planets are present', () => {
    renderTable(<PlanetaryTable planets={null} />);
    // The unavailable message is i18n'd; with no i18next instance bound in
    // this unit test, react-i18next renders the translation KEY verbatim.
    expect(screen.getByText('planetary.unavailable')).toBeTruthy();
  });

  it('still works with the legacy planets-record prop', () => {
    renderTable(
      <PlanetaryTable
        planets={{
          sun: {
            name: 'sun',
            longitude: 42.5,
            sign: 'taurus',
            sign_lord: 'venus',
            nakshatra: 'Rohini',
            nakshatra_lord: 'moon',
            nakshatra_pada: 3,
            house: 2,
            is_retrograde: false,
          },
        }}
      />,
    );
    expect(screen.getByText('sun')).toBeTruthy();
    // 42.5° longitude → 12.5° within Taurus → 12°30'.
    expect(screen.getByText("12°30'")).toBeTruthy();
  });
});
