/**
 * ReportStrength — the printed planetary-strength section: the SAV per-sign
 * bindu grid (with the canonical 337 total), and the Ṣaḍbala rūpa table
 * against the classical minimum, with `approximated` component flags shown
 * honestly (≈ + footnote). Engine StrengthCtx verbatim.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanetShadbalaData, StrengthCtx, ZodiacSign } from '@almamesh/shared-types';
import { formatPredictiveDate } from '../../../lib/predictive';
import { grahaName, signName } from '../../../lib/predictiveEventCopy';
import { hasApproximatedComponents } from '../predictive/StrengthPanel';
import { ReportSectionHeading } from './ReportSectionHeading';

const SIGN_ORDER: readonly ZodiacSign[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

interface ReportStrengthProps {
  readonly strengthCtx: StrengthCtx;
}

/** Ashtakavarga + Shadbala for print. */
export function ReportStrength({ strengthCtx }: ReportStrengthProps): ReactElement {
  const { t } = useTranslation('report');
  const { t: tp } = useTranslation('predictive');
  const sarva = strengthCtx.ashtakavarga.sarva;
  const shadbalaRows = Object.values(strengthCtx.shadbala.planets).filter(
    (row): row is PlanetShadbalaData => row !== undefined,
  );
  const anyApprox = shadbalaRows.some(hasApproximatedComponents);

  return (
    <section className="report-section" data-testid="report-strength">
      <ReportSectionHeading index="VIII" title={t('strength.heading')} />

      <h3 className="report-subsection-title">
        {t('strength.sav_heading')} — {t('strength.sav_total', { total: sarva.total })}
      </h3>
      <dl className="report-sign-grid report-avoid-break" data-testid="report-sav-grid">
        {SIGN_ORDER.map((sign) => (
          <div className="report-sign-cell" key={sign}>
            <dt>{signName(tp, sign)}</dt>
            <dd>{sarva.bindus[sign]}</dd>
          </div>
        ))}
      </dl>

      <h3 className="report-subsection-title">{t('strength.shadbala_heading')}</h3>
      <table className="report-table" data-testid="report-shadbala">
        <thead>
          <tr>
            <th scope="col">{t('strength.col_graha')}</th>
            <th scope="col">{t('strength.col_rupas')}</th>
            <th scope="col">{t('strength.col_required')}</th>
            <th scope="col">{t('strength.col_verdict')}</th>
          </tr>
        </thead>
        <tbody>
          {shadbalaRows.map((row) => (
            <tr key={row.planet} className="report-avoid-break">
              <td>
                {grahaName(tp, row.planet)}
                {hasApproximatedComponents(row) ? ' ≈' : ''}
              </td>
              <td>{row.total_rupas}</td>
              <td>{row.required_rupas}</td>
              <td>{row.meets_minimum ? t('strength.meets') : t('strength.below')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {anyApprox && <p className="report-note">{tp('strength.approx_footnote')}</p>}
      <p className="report-note">
        {tp('strength.sunrise_basis', {
          date: formatPredictiveDate(strengthCtx.sunrise_utc_iso),
        })}
      </p>
    </section>
  );
}
