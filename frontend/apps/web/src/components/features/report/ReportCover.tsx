/**
 * ReportCover — the branded first page of the printed Vedic report.
 *
 * Shows the AlmaMesh wordmark, the audience badge (For You / For Astrologer),
 * the person's name, a birth-details box (date/time in the BIRTH timezone via
 * `formatBirthDateTime`, place via `buildPlaceString`, ascendant), and the
 * generated date via `formatReportDate(new Date())` — which is null/epoch-safe,
 * so the cover never reads "December 31, 1969" the way the old export did.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LagnaData } from '@almamesh/browser/types';
import type { ProcessedBirthData } from '@almamesh/shared-types';
import {
  buildPlaceString,
  formatBirthDateTime,
  formatDegree,
  formatReportDate,
} from '../../../lib/reportData';
import { cuspInfo } from '../../../lib/lagnaCusp';
import type { ReportAudience } from '../../../lib/reportSelectors';

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

interface ReportCoverProps {
  readonly personName: string;
  readonly audience: ReportAudience;
  readonly birth: ProcessedBirthData;
  readonly lagna: LagnaData;
}

/** Cover page: wordmark, audience badge, name, birth box, generated date. */
export function ReportCover({ personName, audience, birth, lagna }: ReportCoverProps): ReactElement {
  const { t } = useTranslation('report');
  const when = formatBirthDateTime(birth);
  const place = buildPlaceString(birth);

  return (
    <section className="report-section report-cover" data-testid="report-cover">
      <div className="report-cover-brand">
        <span className="report-cover-mark">AlmaMesh</span>
        <span className="report-cover-kicker">{t('cover.kicker')}</span>
      </div>

      <svg
        className="report-cover-ornament"
        viewBox="0 0 64 18"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="0" y1="9" x2="24" y2="9" stroke="currentColor" strokeWidth="0.75" />
        <line x1="40" y1="9" x2="64" y2="9" stroke="currentColor" strokeWidth="0.75" />
        <path d="M32 2 L33.4 7.6 L39 9 L33.4 10.4 L32 16 L30.6 10.4 L25 9 L30.6 7.6 Z" fill="currentColor" />
      </svg>

      <span className="report-cover-badge" data-testid="report-audience-badge">
        {t(`audience.${audience}`)}
      </span>

      <span className="report-cover-prepared">{t('cover.prepared_for')}</span>
      <h1 className="report-cover-name">{personName}</h1>

      <dl className="report-cover-birth">
        <div className="report-cover-birth-item">
          <dt>{t('cover.date_of_birth')}</dt>
          <dd data-testid="report-birth-date">{when.date || '—'}</dd>
        </div>
        <div className="report-cover-birth-item">
          <dt>{t('cover.time_of_birth')}</dt>
          <dd>
            {when.time || '—'}
            {when.tzLabel ? ` (${when.tzLabel})` : ''}
          </dd>
        </div>
        <div className="report-cover-birth-item report-cover-birth-item-full">
          <dt>{t('cover.place_of_birth')}</dt>
          <dd data-testid="report-birth-place">{place || '—'}</dd>
        </div>
        <div className="report-cover-birth-item report-cover-birth-item-full">
          <dt>{t('cover.ascendant')}</dt>
          <dd>
            {titleCase(lagna.sign)} {formatDegree(lagna.sign_degrees)}
            {/* Generic near-cusp note (any sign, either boundary). Letterpress
                honesty for print: names the alternative rising sign, states that
                house-based interpretation depends on the recorded time, and
                recommends refining the birth time before relying on house
                placements (copy lives in report:cover.cusp_note). */}
            {(() => {
              const cusp = cuspInfo(titleCase(lagna.sign), lagna.sign_degrees);
              return cusp ? (
                <span className="report-cover-cusp" data-testid="report-cusp-note">
                  {t('cover.cusp_note', {
                    degrees: cusp.degrees.toFixed(1),
                    sign: cusp.neighbourSign,
                  })}
                </span>
              ) : null;
            })()}
          </dd>
        </div>
      </dl>

      <p className="report-cover-generated" data-testid="report-generated-date">
        {t('cover.generated_on', { date: formatReportDate(new Date()) })}
      </p>
    </section>
  );
}
