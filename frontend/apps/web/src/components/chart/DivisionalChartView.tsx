/**
 * DivisionalChartView — the D9 Navamsa divisional kundli panel.
 *
 * Renders the engine's D9 Navamsa via the SAME North/South Indian chart SVGs the
 * D1 (Rāśi) chart uses, fed by `buildVargaGeometry` (a pure reshape — no
 * astrology). It honors the shared `displayStyle` toggle so D1 and D9 always
 * render in the same style, and the shared `selectedPlanet` cross-highlight.
 *
 * Guarded: renders nothing unless the engine emitted a navamsa, so there is never
 * an empty divisional table (the old DivisionalCharts anti-pattern).
 */

import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { SiderealChart } from '@almamesh/browser/types';
import { buildVargaGeometry, useChartStore, type VargaChart } from '@almamesh/store';
import { Card } from '../ui';
import { ChartStyleToggle } from './ChartStyleToggle';
import { NorthIndianChartSVG } from './NorthIndianChartSVG';
import { SouthIndianChartSVG } from './SouthIndianChartSVG';
import type { ChartVariant } from './chartTheme';

interface DivisionalChartViewProps {
  /** The engine's raw chart; its `navamsa` field feeds the D9 geometry. */
  readonly siderealChart: SiderealChart | null;
  /** Rendered chart size in px (default 350). */
  readonly size?: number;
  /** Color theme forwarded to the kundli renderer: `screen` (default) or `paper`. */
  readonly variant?: ChartVariant;
}

/** D9 Navamsa kundli, rendered through the shared N/S chart SVGs. */
export function DivisionalChartView({
  siderealChart,
  size = 350,
  variant = 'screen',
}: DivisionalChartViewProps): ReactElement | null {
  const { t } = useTranslation('astrology');
  // The South SVG's centre label must name THIS chart (D9 · Navāṁśa), never
  // its D1 "Rāśi" default — varga names live in the predictive catalog.
  const { t: tp } = useTranslation('predictive');
  const displayStyle = useChartStore((state) => state.displayStyle);
  const selectedPlanet = useChartStore((state) => state.selectedPlanet);
  const setSelectedPlanet = useChartStore((state) => state.setSelectedPlanet);

  // The engine emits the navamsa with Title-Case signs; `buildVargaGeometry`
  // consumes exactly that shape. Memoized so the reshape runs once per chart.
  const geometry = useMemo(() => {
    const nav = siderealChart?.navamsa;
    if (!nav) return null;
    const varga: VargaChart = {
      name: nav.name,
      lagna_sign: nav.lagna_sign,
      lagna_sign_lord: nav.lagna_sign_lord,
      planets: nav.planets,
    };
    return buildVargaGeometry(varga);
  }, [siderealChart]);

  // No navamsa -> render nothing (no empty table).
  if (!geometry) return null;

  return (
    <Card
      title={t('varga.d9_title')}
      subtitle={t('varga.d9_subtitle')}
      actions={<ChartStyleToggle />}
      className="print-container print-no-break"
      data-testid="divisional-chart-d9"
    >
      <div className="flex justify-center print-chart-box">
        {displayStyle === 'north' ? (
          <NorthIndianChartSVG
            geometry={geometry}
            selectedPlanet={selectedPlanet}
            onSelectPlanet={setSelectedPlanet}
            size={size}
            variant={variant}
          />
        ) : (
          <SouthIndianChartSVG
            geometry={geometry}
            selectedPlanet={selectedPlanet}
            onSelectPlanet={setSelectedPlanet}
            size={size}
            variant={variant}
            centerTitle={tp('vargas.names.D9')}
            centerCode="D9"
          />
        )}
      </div>
    </Card>
  );
}
