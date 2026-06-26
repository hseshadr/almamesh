/**
 * ReportPlanetTable — the full planetary-positions table (Rāśi / D1).
 *
 * Reads the engine's own per-planet fields verbatim (calculation integrity); the
 * only transforms are display formatting (`formatDegree`, title-casing the
 * lowercase enum values, and joining the retro/combust flags). The `<thead>` is
 * a `table-header-group` so it repeats if the table breaks across printed pages.
 */

import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { PlanetPosition, SiderealChart } from '@almamesh/browser/types';
import { formatDegree } from '../../../lib/reportData';
import { ReportSectionHeading } from './ReportSectionHeading';

/** Canonical graha order so the table reads sun → … → ketu, not dict order. */
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

/** Human dignity label ("own_sign" → "Own Sign"). */
function dignityLabel(dignity: string): string {
  if (!dignity) return '—';
  return dignity
    .split('_')
    .map((part) => titleCase(part))
    .join(' ');
}

/** "Retro (R)", "Combust", or "—" — the planet's special states, joined. */
function flagsLabel(planet: PlanetPosition, t: TFunction<'report'>): string {
  const flags: string[] = [];
  // ASCII "(R)" for retrograde, not the U+211E ℞ glyph: the print font
  // (Spline Sans Mono) has no ℞ glyph, so it printed as a tofu box in the PDF.
  if (planet.is_retrograde) flags.push(t('planets.retrograde'));
  if (planet.is_combust) flags.push(t('planets.combust'));
  return flags.length > 0 ? flags.join(', ') : '—';
}

function orderedPlanets(chart: SiderealChart): readonly PlanetPosition[] {
  const planets = Object.values(chart.planets);
  const indexOf = (name: string): number => {
    const i = PLANET_ORDER.indexOf(name);
    return i === -1 ? PLANET_ORDER.length : i;
  };
  return [...planets].sort((a, b) => indexOf(a.name) - indexOf(b.name));
}

interface ReportPlanetTableProps {
  readonly chart: SiderealChart;
}

/** Full-width planetary positions table for the printed report. */
export function ReportPlanetTable({ chart }: ReportPlanetTableProps): ReactElement {
  const { t } = useTranslation('report');
  const planets = orderedPlanets(chart);

  return (
    <section className="report-section" data-testid="report-planet-table">
      <ReportSectionHeading index="II" title={t('planets.heading')} />
      <table className="report-table">
        <thead>
          <tr>
            <th scope="col">{t('planets.col_planet')}</th>
            <th scope="col">{t('planets.col_sign')}</th>
            <th scope="col">{t('planets.col_degree')}</th>
            <th scope="col">{t('planets.col_house')}</th>
            <th scope="col">{t('planets.col_nakshatra')}</th>
            <th scope="col">{t('planets.col_dignity')}</th>
            <th scope="col">{t('planets.col_state')}</th>
          </tr>
        </thead>
        <tbody>
          {planets.map((planet) => (
            <tr key={planet.name} className="report-avoid-break">
              <td>{titleCase(planet.name)}</td>
              <td>{titleCase(planet.sign)}</td>
              <td>{formatDegree(planet.sign_degrees)}</td>
              <td>{planet.house}</td>
              <td>
                {planet.nakshatra} · {planet.nakshatra_pada}
              </td>
              <td>{dignityLabel(planet.dignity)}</td>
              <td>{flagsLabel(planet, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
