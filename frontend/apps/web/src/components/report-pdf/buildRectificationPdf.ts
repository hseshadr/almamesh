/**
 * buildRectificationPdf — reshape a confirmed `RectificationRecord` (+ its
 * resolved supporting life events) into the pre-formatted Section XII slice.
 *
 * QUALITATIVE ONLY by contract: the facts carry the entered/working clocks +
 * rising signs, the fit mode, the confidence band and the confirm date — the
 * record's numeric `margin` is deliberately NEVER rendered (no percentage, no
 * fit score; band = convention, never a verdict). Band + category labels reuse
 * the `rectify` namespace via the injected `t`, so report and wizard copy stay
 * identical. Pure: no store reads, no astrology.
 */

import type { TFunction } from 'i18next';
import type {
  RectificationCandidate,
  RectificationRecord,
  RectificationResult,
} from '@almamesh/shared-types';
import { formatReportDate } from '../../lib/reportData';
// Event dates are DATE-ONLY strings — formatPredictiveDate renders the calendar
// date as written (formatReportDate would reparse through UTC and roll it back
// a day west of GMT).
import { formatPredictiveDate } from '../../lib/predictive';
import { signName } from '../../lib/predictiveEventCopy';
import { evidencePolarity, localizeSignal } from '../../lib/rectifySignals';
import { glyphSafe } from './glyphSafe';
import type { ReportPdfRectification } from './types';

/** The slice of a resolved life event the section prints (no ids, no PII keys). */
export interface RectificationPdfEvent {
  /** ISO `YYYY-MM-DD`, or "" when the event carries no structured date. */
  readonly date: string;
  /** Engine category token (e.g. "marriage"), or undefined on legacy drafts. */
  readonly category?: string;
  /** The user's own "what happened" headline, or undefined. */
  readonly summary?: string;
}

export interface BuildRectificationPdfInput {
  readonly record: RectificationRecord;
  /** The record's supporting events, resolved by the caller (may be empty). */
  readonly events: ReadonlyArray<RectificationPdfEvent>;
  /** i18next `t` bound to the `report` namespace (cross-ns `rectify:` works). */
  readonly t: TFunction;
}

/** "07:45 — Pisces rising", the honest "Not recorded", or the bare clock. */
function timeWithSign(t: TFunction, time: string, sign: string | null): string {
  if (!time) {
    return t('rectification.time_unknown');
  }
  return sign ? t('rectification.time_with_sign', { time, sign: signName(t, sign) }) : time;
}

/** The snapshot candidate the user confirmed (falls back to the ranked top). */
function chosenCandidate(
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

/**
 * Phase 2 (Spec 062): the optional evidence-story slice from a v2 record's
 * `resultSnapshot` — candidate table, per-event evidence with the SAME
 * depth/polarity labels the wizard shows (shared `lib/rectifySignals` parser,
 * `rectify:` cross-namespace), misses, prior note. Returns {} for v1 records,
 * leaving the classic section byte-identical. Qualitative only — the
 * snapshot's numeric fields are read solely for presence/sign, never printed.
 */
function buildSnapshotSlices(
  record: RectificationRecord,
  t: TFunction,
): Partial<ReportPdfRectification> {
  const snapshot = record.resultSnapshot;
  if (!snapshot || snapshot.candidates.length === 0) {
    return {};
  }
  const chosen = chosenCandidate(record, snapshot);

  const readingFor = (candidate: RectificationCandidate): string => {
    if (chosen !== null && candidate === chosen) return t('rectification.chosen_label');
    return snapshot.band === 'near_tie'
      ? t('rectification.near_tie_alternative_label')
      : t('rectification.alternative_label');
  };

  const candidates = {
    headers: [
      t('rectification.col_candidate'),
      t('rectification.col_sign'),
      t('rectification.col_time'),
      t('rectification.col_navamsa'),
      t('rectification.col_reading'),
    ].map((header) => glyphSafe(header)),
    rows: snapshot.candidates.map((candidate, index) => ({
      cells: [
        glyphSafe(String(index + 1)),
        glyphSafe(signName(t, candidate.ascendantSign)),
        glyphSafe(candidate.representativeTimeLocal),
        glyphSafe(
          candidate.navamsaLagnaSign !== null ? signName(t, candidate.navamsaLagnaSign) : '—',
        ),
        glyphSafe(readingFor(candidate)),
      ],
    })),
    widths: [0.7, 1.2, 1.4, 1.2, 1.5],
  };

  const evidence =
    chosen !== null && chosen.supportingEvents.length > 0
      ? {
          headers: [
            t('rectification.col_date'),
            t('rectification.col_category'),
            t('rectification.col_signals'),
            t('rectification.col_reading'),
          ].map((header) => glyphSafe(header)),
          rows: chosen.supportingEvents.map((ev) => ({
            cells: [
              glyphSafe(ev.date ? formatPredictiveDate(ev.date) : '—'),
              glyphSafe(t(`rectify:categories.${ev.category}`)),
              glyphSafe(ev.signals.map((s) => localizeSignal(t, s, 'rectify:')).join('; ')),
              glyphSafe(
                evidencePolarity(ev.signals, ev.contribution) === 'against'
                  ? t('rectify:results.evidence_against')
                  : t('rectify:results.evidence_supports'),
              ),
            ],
          })),
          widths: [1, 1.2, 2.8, 1],
        }
      : undefined;

  const missNotes =
    chosen !== null && chosen.misses.length > 0
      ? chosen.misses.map((miss) => glyphSafe(localizeSignal(t, miss, 'rectify:')))
      : undefined;

  return {
    candidatesHeading: glyphSafe(t('rectification.candidates_heading')),
    candidates,
    ...(evidence !== undefined
      ? { evidenceHeading: glyphSafe(t('rectification.evidence_heading')), evidence }
      : {}),
    ...(missNotes !== undefined
      ? { missesHeading: glyphSafe(t('rectification.misses_heading')), missNotes }
      : {}),
    ...(chosen !== null && chosen.priorBonus > 0
      ? { priorNote: glyphSafe(t('rectification.prior_note')) }
      : {}),
  };
}

/** Build the pre-localized Birth Time Authority slice for the PDF. */
export function buildRectificationPdf({
  record,
  events,
  t,
}: BuildRectificationPdfInput): ReportPdfRectification {
  const facts = [
    {
      label: t('rectification.entered_label'),
      value: timeWithSign(t, record.originalTime, record.originalSign),
    },
    {
      label: t('rectification.working_label'),
      value: timeWithSign(t, record.rectifiedTime, record.rectifiedSign),
    },
    { label: t('rectification.mode_label'), value: t(`rectification.mode.${record.mode}`) },
    { label: t('rectification.band_label'), value: t(`rectify:band.${record.band}`) },
    { label: t('rectification.confirmed_label'), value: formatReportDate(record.confirmedAt) },
  ].map((fact) => ({ label: glyphSafe(fact.label), value: glyphSafe(fact.value) }));

  return {
    chrome: {
      eyebrow: glyphSafe(t('pdf.rectification_eyebrow')),
      title: glyphSafe(t('rectification.heading')),
      intro: glyphSafe(t('pdf.rectification_intro')),
    },
    facts,
    eventsHeading: glyphSafe(t('rectification.events_heading')),
    events: {
      headers: [
        t('rectification.col_date'),
        t('rectification.col_category'),
        t('rectification.col_event'),
      ].map((header) => glyphSafe(header)),
      rows: events.map((event) => ({
        cells: [
          glyphSafe(event.date ? formatPredictiveDate(event.date) : '—'),
          glyphSafe(event.category ? t(`rectify:categories.${event.category}`) : '—'),
          glyphSafe(event.summary || '—'),
        ],
      })),
      widths: [1, 1.4, 2.6],
    },
    eventsEmpty: glyphSafe(t('rectification.events_empty')),
    caveat: glyphSafe(t('rectification.caveat')),
    ...buildSnapshotSlices(record, t),
  };
}
