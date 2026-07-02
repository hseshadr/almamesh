/**
 * ReportRectification — Section "Birth Time Authority": how the working birth
 * time of this chart was established.
 *
 * Renders the confirmed `RectificationRecord` verbatim: entered vs working
 * time + rising sign, the engine fit mode, the QUALITATIVE confidence band
 * (a convention, never a verdict — NO percentage, NO margin number, NO fit
 * scores), the confirmation date, and the dated life events that supported the
 * fit (resolved by the page from the lifeEvents store).
 *
 * Phase 2 (Spec 062): when the record carries a `resultSnapshot` (v2), the
 * full story prints without recompute — the candidate comparison table (sign,
 * representative time, navamsa rising, qualitative reading), the per-event
 * evidence with the same depth/polarity labels the wizard uses (via the shared
 * `lib/rectifySignals` parser), the quiet-period misses, and the prior note.
 * v1 records (no snapshot) gracefully render the original content only.
 *
 * Closes with the honest caveat: event-based rectification resolves the SIGN,
 * not the minute. Band + category + signal labels reuse the `rectify`
 * namespace so the report and the wizard never drift apart.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { LifeEvent } from '@almamesh/store';
import type {
  RectificationCandidate,
  RectificationRecord,
  RectificationResult,
} from '@almamesh/shared-types';
import { formatReportDate } from '../../../lib/reportData';
// Event dates are DATE-ONLY strings — formatPredictiveDate renders the calendar
// date as written (formatReportDate would reparse through UTC and roll it back
// a day west of GMT).
import { formatPredictiveDate } from '../../../lib/predictive';
import { signName } from '../../../lib/predictiveEventCopy';
import { evidencePolarity, localizeSignal } from '../../../lib/rectifySignals';
import { ReportSectionHeading } from './ReportSectionHeading';

interface ReportRectificationProps {
  readonly record: RectificationRecord;
  /** The record's supporting life events, resolved by the page (may be empty). */
  readonly events: readonly LifeEvent[];
}

/** The headline a supporting-event row shows ("what happened", user's words). */
function eventHeadline(event: LifeEvent): string {
  return event.summary ?? event.note ?? event.description ?? '—';
}

/** The snapshot candidate the user confirmed (falls back to the ranked top). */
export function chosenCandidate(
  record: RectificationRecord,
  snapshot: RectificationResult,
): RectificationCandidate | null {
  const match = snapshot.candidates.find(
    (c) =>
      c.ascendantSign.toLowerCase() === record.rectifiedSign.toLowerCase() &&
      c.representativeTimeLocal === record.rectifiedTime,
  );
  return match ?? snapshot.candidates[0] ?? null;
}

/** Birth Time Authority — the confirmed rectification, qualitative only. */
export function ReportRectification({ record, events }: ReportRectificationProps): ReactElement {
  const { t } = useTranslation('report');

  const timeWithSign = (time: string, sign: string | null): string => {
    if (!time) {
      return t('rectification.time_unknown');
    }
    return sign ? t('rectification.time_with_sign', { time, sign: signName(t, sign) }) : time;
  };

  const snapshot = record.resultSnapshot ?? null;
  const chosen = snapshot != null ? chosenCandidate(record, snapshot) : null;

  /** Qualitative reading cell for a snapshot candidate — never a number. */
  const candidateReading = (candidate: RectificationCandidate): string => {
    if (chosen != null && candidate === chosen) {
      return t('rectification.chosen_label');
    }
    return snapshot?.band === 'near_tie'
      ? t('rectification.near_tie_alternative_label')
      : t('rectification.alternative_label');
  };

  return (
    <section className="report-section" data-testid="report-rectification">
      <ReportSectionHeading index="XI" title={t('rectification.heading')} />

      <dl className="report-dasha-current report-avoid-break" data-testid="report-rectification-facts">
        <div className="report-dasha-leg">
          <dt>{t('rectification.entered_label')}</dt>
          <dd>{timeWithSign(record.originalTime, record.originalSign)}</dd>
        </div>
        <div className="report-dasha-leg">
          <dt>{t('rectification.working_label')}</dt>
          <dd>{timeWithSign(record.rectifiedTime, record.rectifiedSign)}</dd>
        </div>
        <div className="report-dasha-leg">
          <dt>{t('rectification.mode_label')}</dt>
          <dd>{t(`rectification.mode.${record.mode}`)}</dd>
        </div>
        <div className="report-dasha-leg">
          <dt>{t('rectification.band_label')}</dt>
          <dd data-testid="report-rectification-band">{t(`rectify:band.${record.band}`)}</dd>
        </div>
        <div className="report-dasha-leg">
          <dt>{t('rectification.confirmed_label')}</dt>
          <dd>{formatReportDate(record.confirmedAt)}</dd>
        </div>
      </dl>

      <h3 className="report-subsection-title">{t('rectification.events_heading')}</h3>
      {events.length === 0 ? (
        <p className="report-note">{t('rectification.events_empty')}</p>
      ) : (
        <table className="report-table" data-testid="report-rectification-events">
          <thead>
            <tr>
              <th scope="col">{t('rectification.col_date')}</th>
              <th scope="col">{t('rectification.col_category')}</th>
              <th scope="col">{t('rectification.col_event')}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="report-avoid-break">
                <td>{event.date ? formatPredictiveDate(event.date) : '—'}</td>
                <td>{event.category ? t(`rectify:categories.${event.category}`) : '—'}</td>
                <td>{eventHeadline(event)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Phase 2: the full evidence story from the confirmed snapshot ──── */}
      {snapshot != null && snapshot.candidates.length > 0 && (
        <>
          <h3 className="report-subsection-title">{t('rectification.candidates_heading')}</h3>
          <table className="report-table" data-testid="report-rectification-candidates">
            <thead>
              <tr>
                <th scope="col">{t('rectification.col_candidate')}</th>
                <th scope="col">{t('rectification.col_sign')}</th>
                <th scope="col">{t('rectification.col_time')}</th>
                <th scope="col">{t('rectification.col_navamsa')}</th>
                <th scope="col">{t('rectification.col_reading')}</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.candidates.map((candidate, index) => (
                <tr
                  key={candidate.ascendantSign + candidate.representativeTimeLocal}
                  className="report-avoid-break"
                >
                  <td>{index + 1}</td>
                  <td>{signName(t, candidate.ascendantSign)}</td>
                  <td>{candidate.representativeTimeLocal}</td>
                  <td>
                    {candidate.navamsaLagnaSign != null
                      ? signName(t, candidate.navamsaLagnaSign)
                      : '—'}
                  </td>
                  <td>{candidateReading(candidate)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {chosen != null && chosen.supportingEvents.length > 0 && (
            <>
              <h3 className="report-subsection-title">{t('rectification.evidence_heading')}</h3>
              <table className="report-table" data-testid="report-rectification-evidence">
                <thead>
                  <tr>
                    <th scope="col">{t('rectification.col_date')}</th>
                    <th scope="col">{t('rectification.col_category')}</th>
                    <th scope="col">{t('rectification.col_signals')}</th>
                    <th scope="col">{t('rectification.col_reading')}</th>
                  </tr>
                </thead>
                <tbody>
                  {chosen.supportingEvents.map((evidence) => (
                    <tr
                      key={`${evidence.eventIndex}-${evidence.date}`}
                      className="report-avoid-break"
                    >
                      <td>{evidence.date ? formatPredictiveDate(evidence.date) : '—'}</td>
                      <td>{t(`rectify:categories.${evidence.category}`)}</td>
                      <td>
                        {evidence.signals
                          .map((signal) => localizeSignal(t, signal, 'rectify:'))
                          .join('; ')}
                      </td>
                      <td>
                        {evidencePolarity(evidence.signals, evidence.contribution) === 'against'
                          ? t('rectify:results.evidence_against')
                          : t('rectify:results.evidence_supports')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {chosen != null && chosen.misses.length > 0 && (
            <>
              <h3 className="report-subsection-title">{t('rectification.misses_heading')}</h3>
              <ul className="report-note" data-testid="report-rectification-misses">
                {chosen.misses.map((miss) => (
                  <li key={miss}>{localizeSignal(t, miss, 'rectify:')}</li>
                ))}
              </ul>
            </>
          )}

          {chosen != null && chosen.priorBonus > 0 && (
            <p className="report-note" data-testid="report-rectification-prior">
              {t('rectification.prior_note')}
            </p>
          )}
        </>
      )}

      <p className="report-note" data-testid="report-rectification-caveat">
        {t('rectification.caveat')}
      </p>
    </section>
  );
}
