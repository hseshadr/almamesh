/**
 * ReportHouses — the whole-sign houses (bhāva) table.
 *
 * Contract: 12 rows in house order, sign + sign lord verbatim (title-cased
 * display only), occupants grouped purely from each planet's engine-emitted
 * `house` field, "—" for empty houses — and NO degree text anywhere (whole-sign
 * cusp longitudes are sign-starts; a "0°00′" column would read as a bug).
 *
 * All data is SYNTHETIC (a "Reference Native") — never real birth data.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { PlanetPosition, SiderealChart } from '@almamesh/browser/types';

import '../../../../i18n/config';
import { ReportHouses, buildHouseRows } from '../ReportHouses';

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

function planet(name: string, house: number): PlanetPosition {
  return {
    name,
    longitude: 100.5,
    latitude: 0,
    distance: 1,
    speed: 1,
    is_retrograde: false,
    sign: 'Cancer',
    sign_degrees: 10.5,
    sign_lord: 'moon',
    nakshatra: 'Pushya',
    nakshatra_pada: 1,
    nakshatra_lord: 'saturn',
    house,
    dignity: 'neutral',
    is_combust: false,
    combustion_separation_deg: null,
    houses_ruled: [2],
    is_yogakaraka: false,
  } as PlanetPosition;
}

const CHART: SiderealChart = {
  ayanamsa_value: 23.86,
  lagna: {
    longitude: 5.4,
    sign: 'Aries',
    sign_degrees: 5.4,
    sign_lord: 'mars',
    nakshatra: 'Ashwini',
    nakshatra_pada: 2,
    nakshatra_lord: 'ketu',
  },
  planets: {
    // Deliberately NOT in canonical order — the table must reorder occupants.
    ketu: planet('ketu', 4),
    sun: planet('sun', 4),
    saturn: planet('saturn', 10),
  },
  houses: Object.fromEntries(
    SIGNS.map((sign, i) => [
      String(i + 1),
      { house: i + 1, longitude: i * 30, sign, sign_lord: 'mars' },
    ]),
  ) as SiderealChart['houses'],
  dashas: {
    maha_dasha_sequence: [],
    current_maha: null,
    current_antar: null,
    current_pratyantar: null,
  },
  yogas: [],
  navamsa: null,
};

describe('ReportHouses — whole-sign bhāva table', () => {
  it('renders all 12 houses in order with their signs and lords', () => {
    render(<ReportHouses chart={CHART} />);
    const table = within(screen.getByTestId('report-houses')).getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(13); // header + 12 houses
    expect(rows[1].textContent).toContain('Aries');
    expect(rows[12].textContent).toContain('Pisces');
    expect(rows[1].textContent).toContain('Mars'); // title-cased sign lord
  });

  it('groups occupants from each planet\'s engine-emitted house, in graha order', () => {
    const rows = buildHouseRows(CHART);
    expect(rows[3].occupants).toBe('Sun, Ketu'); // house 4: sun before ketu
    expect(rows[9].occupants).toBe('Saturn'); // house 10
    expect(rows[0].occupants).toBe('—'); // empty house
  });

  it('prints NO degree text (whole-sign cusps are sign-starts, not real cusps)', () => {
    render(<ReportHouses chart={CHART} />);
    expect(screen.getByTestId('report-houses').textContent).not.toContain('°');
  });
});
