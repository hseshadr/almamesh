/**
 * ReportHouses — the twelve whole-sign houses (bhāva) table.
 *
 * Reads the engine's `houses` map verbatim: each row is the house number, its
 * sign, the sign lord, and the grahas the engine placed in that house (grouped
 * purely from each planet's emitted `house` field — no astrology recomputed).
 * NO cusp-degree column is printed: houses are whole-sign, so the engine's
 * `longitude` is a sign-start (a 30° multiple), never an interpolated quadrant
 * cusp — printing "0°00′" would read as a calculation bug.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiderealChart } from '@almamesh/browser/types';
import { ReportSectionHeading } from './ReportSectionHeading';

/** Canonical graha order so occupant lists read sun → … → ketu, not dict order. */
const PLANET_ORDER: readonly string[] = [
  'sun',
  'moon',
  'mars',
  'mercury',
  'jupiter',
  'venus',
  'saturn',
  'rahu',
  'ketu',
];

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** One display row of the houses table (pure reshape of engine output). */
export interface HouseRow {
  readonly house: number;
  readonly sign: string;
  readonly signLord: string;
  readonly occupants: string;
}

/**
 * The 12 house rows in house order. Occupants are grouped from each planet's
 * engine-emitted `house` (a pure reshape); "—" when a house is empty.
 */
export function buildHouseRows(chart: SiderealChart): readonly HouseRow[] {
  const planets = [...Object.values(chart.planets)].sort(
    (a, b) => PLANET_ORDER.indexOf(a.name) - PLANET_ORDER.indexOf(b.name),
  );
  return Object.values(chart.houses)
    .slice()
    .sort((a, b) => a.house - b.house)
    .map((cusp) => {
      const occupants = planets
        .filter((planet) => planet.house === cusp.house)
        .map((planet) => titleCase(planet.name))
        .join(', ');
      return {
        house: cusp.house,
        sign: titleCase(cusp.sign),
        signLord: titleCase(cusp.sign_lord),
        occupants: occupants || '—',
      };
    });
}

interface ReportHousesProps {
  readonly chart: SiderealChart;
}

/** Whole-sign houses table for the printed report. */
export function ReportHouses({ chart }: ReportHousesProps): ReactElement {
  const { t } = useTranslation('report');
  const rows = buildHouseRows(chart);

  return (
    <section className="report-section" data-testid="report-houses">
      <ReportSectionHeading index="III" title={t('houses.heading')} />
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">{t('houses.col_house')}</th>
            <th scope="col">{t('houses.col_sign')}</th>
            <th scope="col">{t('houses.col_lord')}</th>
            <th scope="col">{t('houses.col_occupants')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.house} className="report-avoid-break">
              <td>{row.house}</td>
              <td>{row.sign}</td>
              <td>{row.signLord}</td>
              <td>{row.occupants}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="report-note">{t('houses.whole_sign_note')}</p>
    </section>
  );
}
