/**
 * ReportChartsPage — the D1 Rāśi + D9 Navāṁśa kundli page of the printed report.
 *
 * Both charts render in the `paper` variant (light cells, dark ink, brass lagna)
 * inside matching framed paper PLATES so they reproduce faithfully under
 * `print-color-adjust: exact`. The D9 is rendered DIRECTLY here via
 * `buildVargaGeometry` + the shared paper-variant SVG — it deliberately does NOT
 * reuse `DivisionalChartView`, whose dark `Card` chrome (obsidian panel, app
 * toggle, on-screen subtitle) belongs to the observatory app and looked like a
 * debug widget pasted onto the report. The active North/South display style is
 * honored so both plates match the user's on-screen preference.
 */

import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiderealChart } from '@almamesh/browser/types';
import {
  buildChartGeometry,
  buildVargaGeometry,
  useChartStore,
  type ChartGeometry,
  type VargaChart,
} from '@almamesh/store';
import { NorthIndianChartSVG } from '../../chart/NorthIndianChartSVG';
import { SouthIndianChartSVG } from '../../chart/SouthIndianChartSVG';
import { formatDegree, selectTechnicalFields } from '../../../lib/reportData';
import { ReportSectionHeading } from './ReportSectionHeading';

/** Title-case a lowercase engine lord/sign value for display ("mars" → "Mars"). */
function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** Reshape the engine's D9 navamsa into chart geometry, or null if absent. */
function useNavamsaGeometry(chart: SiderealChart): ChartGeometry | null {
  return useMemo(() => {
    const nav = chart.navamsa;
    if (!nav) return null;
    const varga: VargaChart = {
      name: nav.name,
      lagna_sign: nav.lagna_sign,
      lagna_sign_lord: nav.lagna_sign_lord,
      planets: nav.planets,
    };
    return buildVargaGeometry(varga);
  }, [chart]);
}

/** One framed paper plate: a captioned header over a paper-variant kundli. */
function ChartPlate({
  caption,
  geometry,
  size,
  isNorth,
  centerTitle,
  centerCode,
}: {
  caption: string;
  geometry: ChartGeometry;
  size: number;
  isNorth: boolean;
  /** South-grid centre label overrides (the D9 plate must not read "Rāśi · D1"). */
  centerTitle?: string;
  centerCode?: string;
}): ReactElement {
  return (
    <figure className="report-chart-figure report-avoid-break">
      <figcaption className="report-chart-caption">{caption}</figcaption>
      <div className="report-chart-frame">
        {isNorth ? (
          <NorthIndianChartSVG geometry={geometry} size={size} variant="paper" />
        ) : (
          <SouthIndianChartSVG
            geometry={geometry}
            size={size}
            variant="paper"
            centerTitle={centerTitle}
            centerCode={centerCode}
          />
        )}
      </div>
    </figure>
  );
}

interface ReportChartsPageProps {
  /** The engine's raw chart; drives both the D1 geometry and the D9 navamsa. */
  readonly chart: SiderealChart;
  /** Side length in px for each rendered kundli. */
  readonly size?: number;
}

/** The Rāśi (D1) + Navamsa (D9) charts page, paper-themed for print. */
// 320px fits two framed plates across the A4 measure while keeping the
// South-Indian "(R) 23°58'" degree group clear of the planet abbreviation.
export function ReportChartsPage({ chart, size = 320 }: ReportChartsPageProps): ReactElement {
  const { t } = useTranslation('report');
  // Varga display names live in the predictive catalog (the D9 plate's
  // South-grid centre label must say "Navāṁśa · D9", never "Rāśi · D1").
  const { t: tp } = useTranslation('predictive');
  const displayStyle = useChartStore((state) => state.displayStyle);
  const isNorth = displayStyle === 'north';
  const geometry = useMemo(() => buildChartGeometry(chart), [chart]);
  const navamsa = useNavamsaGeometry(chart);
  const { lagna } = chart;
  const technicalFields = selectTechnicalFields(chart);

  return (
    <section className="report-section report-charts" data-testid="report-charts">
      <ReportSectionHeading index="I" title={t('charts.heading')} />

      <div className="report-charts-grid">
        <ChartPlate caption={t('charts.rasi_caption')} geometry={geometry} size={size} isNorth={isNorth} />
        {navamsa ? (
          <ChartPlate
            caption={t('charts.navamsa_caption')}
            geometry={navamsa}
            size={size}
            isNorth={isNorth}
            centerTitle={tp('vargas.names.D9')}
            centerCode="D9"
          />
        ) : null}
      </div>

      <dl className="report-ascendant report-avoid-break" data-testid="report-ascendant">
        <div className="report-ascendant-item">
          <dt>{t('charts.ascendant')}</dt>
          <dd>
            {titleCase(lagna.sign)} {formatDegree(lagna.sign_degrees)}
          </dd>
        </div>
        <div className="report-ascendant-item">
          <dt>{t('charts.nakshatra')}</dt>
          <dd>
            {t('charts.nakshatra_pada', { nakshatra: lagna.nakshatra, pada: lagna.nakshatra_pada })}
          </dd>
        </div>
        <div className="report-ascendant-item">
          <dt>{t('charts.sign_lord')}</dt>
          <dd>{titleCase(lagna.sign_lord)}</dd>
        </div>
        <div className="report-ascendant-item">
          <dt>{t('charts.nakshatra_lord')}</dt>
          <dd>{titleCase(lagna.nakshatra_lord)}</dd>
        </div>
        {technicalFields.map((field) => (
          <div className="report-ascendant-item" key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
