/**
 * ReportAssumptions — the single "assumptions & provenance" panel.
 *
 * It ASSEMBLES provenance the report already computes elsewhere — it invents
 * NOTHING and recomputes NO astrology:
 *   • Ayanāṁśa — the sidereal convention (Lahiri), the same fact the footer names.
 *   • House system — whole-sign (a constant of this engine).
 *   • Birth time — entered vs. rectified, from the `RectificationDelta` the cover
 *     already derives (`lib/rectification`).
 *   • Ascendant cusp proximity — from `lib/lagnaCusp`, the same source the cover's
 *     cusp callout uses.
 *
 * Making the reading's load-bearing assumptions legible in one place is the
 * honesty move: every verdict downstream rests on exactly these four choices.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LagnaData } from '@almamesh/browser/types';
import { cuspInfo } from '../../../lib/lagnaCusp';
import type { RectificationDelta } from '../../../lib/rectification';
import { ReportSectionHeading } from './ReportSectionHeading';

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

interface ReportAssumptionsProps {
  readonly lagna: LagnaData;
  /** Entered→rectified adjustment, or null when the recorded time was used verbatim. */
  readonly rectification?: RectificationDelta | null;
}

/** The four load-bearing assumptions behind every verdict in this report. */
export function ReportAssumptions({
  lagna,
  rectification,
}: ReportAssumptionsProps): ReactElement {
  const { t } = useTranslation('report');
  const rectified = rectification ?? null;
  const cusp = cuspInfo(titleCase(lagna.sign), lagna.sign_degrees, 3, lagna);
  return (
    <section className="report-section report-assumptions" data-testid="report-assumptions">
      <ReportSectionHeading index="XIII" title={t('assumptions.heading')} />
      <p className="report-assumptions-intro">{t('assumptions.intro')}</p>
      <dl className="report-assumptions-list">
        <div className="report-assumptions-row">
          <dt>{t('assumptions.ayanamsa_label')}</dt>
          <dd data-testid="report-assumptions-ayanamsa">{t('assumptions.ayanamsa_value')}</dd>
        </div>
        <div className="report-assumptions-row">
          <dt>{t('assumptions.house_system_label')}</dt>
          <dd data-testid="report-assumptions-house-system">
            {t('assumptions.house_system_value')}
          </dd>
        </div>
        <div className="report-assumptions-row">
          <dt>{t('assumptions.time_label')}</dt>
          <dd data-testid="report-assumptions-time">
            {rectified
              ? t('assumptions.time_rectified', {
                  entered: rectified.enteredLabel,
                  rectified: rectified.rectifiedLabel,
                })
              : t('assumptions.time_recorded')}
          </dd>
        </div>
        <div className="report-assumptions-row">
          <dt>{t('assumptions.cusp_label')}</dt>
          <dd data-testid="report-assumptions-cusp">
            {cusp
              ? t('assumptions.cusp_near', {
                  degrees: cusp.degrees.toFixed(1),
                  sign: cusp.neighbourSign,
                })
              : t('assumptions.cusp_clear')}
          </dd>
        </div>
      </dl>
    </section>
  );
}
