/**
 * ReportDasha — the Vimshottari Mahā-daśā sequence + the current periods,
 * plus the period drill-down the letterpress document needs: the RUNNING
 * mahā's nine antar-daśās and the running antar's nine pratyantar-daśās
 * (never all 81 antars — page bloat). Each sub-table highlights its running
 * row exactly like the mahā table does.
 *
 * Reads the engine's `dashas` verbatim: spans, lords and durations are the
 * emitted values; "running" rows are located by pure lord + dated-start
 * matching (`lib/dashaPeriods`, no astrology). Older payloads without the
 * depth fields render the classic section unchanged. Dates use the
 * null/epoch-safe `formatReportDate`, so a missing date never renders as 1969.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DashaPeriod, VimshottariDasha } from '@almamesh/browser/types';
import {
  findPeriodRow,
  type DashaTreeRow,
  type DashaTreeSource,
} from '../../../lib/dashaPeriods';
import { formatDurationYears, formatReportDate } from '../../../lib/reportData';
import { ReportSectionHeading } from './ReportSectionHeading';

function titleCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

/** A current-period leg with its level label, or null when the engine omits it. */
function CurrentLeg({ label, period }: { label: string; period: DashaPeriod | null }): ReactElement | null {
  if (!period) {
    return null;
  }
  return (
    <div className="report-dasha-leg">
      <dt>{label}</dt>
      <dd>
        {titleCase(period.lord)} ({formatReportDate(period.start_date)} – {formatReportDate(period.end_date)})
      </dd>
    </div>
  );
}

/**
 * One dated period table (mahā sequence / antars of the running mahā /
 * pratyantars of the running antar): lord · start · end · duration, with the
 * running row highlighted (`aria-current` + the gold letterpress tint).
 */
function PeriodTable({
  rows,
  running,
  testid,
}: {
  rows: readonly DashaTreeRow[];
  running: DashaTreeRow | null;
  testid: string;
}): ReactElement {
  const { t } = useTranslation('report');
  return (
    <table className="report-table" data-testid={testid}>
      <thead>
        <tr>
          <th scope="col">{t('dasha.col_lord')}</th>
          <th scope="col">{t('dasha.col_start')}</th>
          <th scope="col">{t('dasha.col_end')}</th>
          <th scope="col">{t('dasha.col_duration')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((period, index) => {
          const isCurrent =
            running !== null &&
            period.lord === running.lord &&
            period.start_date === running.start_date;
          return (
            <tr
              // Lords repeat across a cycle, so the index disambiguates.
              key={`${period.lord}-${index}`}
              className={isCurrent ? 'report-dasha-row-current report-avoid-break' : 'report-avoid-break'}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <td>
                {titleCase(period.lord)}
                {isCurrent ? ' ·' : ''}
              </td>
              <td>{formatReportDate(period.start_date)}</td>
              <td>{formatReportDate(period.end_date)}</td>
              <td>{t('dasha.years_short', { years: formatDurationYears(period.duration_years) })}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface ReportDashaProps {
  readonly dashas: VimshottariDasha;
}

/** Vimshottari daśā: current periods + mahā table + running-period drill-down. */
export function ReportDasha({ dashas }: ReportDashaProps): ReactElement | null {
  const { t } = useTranslation('report');
  const sequence = dashas.maha_dasha_sequence;

  // The structural tree view of the same payload (adds the optional
  // period-depth fields; pure widening, no cast — see lib/dashaPeriods).
  const tree: DashaTreeSource = dashas;
  const runningMahaRow = findPeriodRow(tree.maha_dasha_sequence, tree.current_maha);
  const antars = runningMahaRow?.antar_sequence ?? null;
  const pratyantars = tree.pratyantar_sequence ?? null;

  if (sequence.length === 0 && !dashas.current_maha) {
    return null;
  }

  return (
    <section className="report-section" data-testid="report-dasha">
      <ReportSectionHeading index="IV" title={t('dasha.heading')} />

      {(dashas.current_maha || dashas.current_antar || dashas.current_pratyantar) && (
        <dl className="report-dasha-current report-avoid-break" data-testid="report-dasha-current">
          <CurrentLeg label={t('dasha.maha')} period={dashas.current_maha} />
          <CurrentLeg label={t('dasha.antar')} period={dashas.current_antar} />
          <CurrentLeg label={t('dasha.pratyantar')} period={dashas.current_pratyantar} />
        </dl>
      )}

      {/* The declared dasha-year convention — cited, never silently switched. */}
      {dashas.convention && (
        <p className="report-note" data-testid="report-dasha-convention">
          {t('dasha.convention_note', {
            convention: t(`predictive:convention.${dashas.convention}`),
          })}
        </p>
      )}

      {sequence.length > 0 && (
        <PeriodTable
          rows={tree.maha_dasha_sequence}
          running={tree.current_maha}
          testid="report-dasha-maha-table"
        />
      )}

      {/* Antar-daśās of the RUNNING mahā only — never all 81 (page bloat). */}
      {dashas.current_maha && antars && antars.length > 0 && (
        <>
          <h3 className="report-subsection-title">
            {t('dasha.antar_heading', { lord: titleCase(dashas.current_maha.lord) })}
          </h3>
          <PeriodTable rows={antars} running={tree.current_antar} testid="report-dasha-antars" />
        </>
      )}

      {/* Pratyantar-daśās of the running antar. */}
      {dashas.current_antar && pratyantars && pratyantars.length > 0 && (
        <>
          <h3 className="report-subsection-title">
            {t('dasha.pratyantar_heading', { lord: titleCase(dashas.current_antar.lord) })}
          </h3>
          <PeriodTable
            rows={pratyantars}
            running={tree.current_pratyantar}
            testid="report-dasha-pratyantars"
          />
        </>
      )}
    </section>
  );
}
