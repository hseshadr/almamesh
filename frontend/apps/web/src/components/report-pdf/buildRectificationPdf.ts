/**
 * buildRectificationPdf — reshape a confirmed `RectificationRecord` (+ its
 * resolved supporting life events) into the pre-formatted Section XII slice.
 *
 * The facts carry the entered/working clocks + rising signs, the fit mode, the
 * confidence band and the confirm date. Rigor Stage 3 (Tier E): the band fact
 * also carries the AGGREGATE calibrated confidence % ("42% — confirmed by N of
 * your events") or "inconclusive" when gated, plus a supporting-vs-opposing
 * COUNT balance fact. The honesty covenant holds: the raw `margin`/fit-score
 * floats are still NEVER rendered, and per-signal evidence stays words only.
 * Band + category labels reuse the `rectify` namespace via the injected `t`, so
 * report and wizard copy stay identical. Pure: no store reads, no astrology.
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
import {
  confidenceLine,
  evidenceBalance,
  evidencePolarity,
  localizeSignal,
} from '../../lib/rectifySignals';
import { glyphSafe } from './glyphSafe';
import type { ReportPdfRectification, ReportPdfTable } from './types';

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

/** Max characters for the "Event" summary cell — a table headline, not prose. */
const EVENT_SUMMARY_MAX = 160;

/**
 * Normalize a supporting-event summary into a clean, single-line table cell.
 *
 * The summary can arrive as a wall of text: the onboarding "tell me about your
 * life" narrative (captured as one event's `description`) or a whole rectify
 * chat turn covering several events. A table cell wants a concise headline, so
 * collapse whitespace and clip to a word boundary with an ellipsis — a short,
 * already-concise summary passes through untouched.
 */
function conciseSummary(raw: string): string {
  const text = normalizedSummary(raw);
  if (text.length <= EVENT_SUMMARY_MAX) {
    return text;
  }
  const head = text.slice(0, EVENT_SUMMARY_MAX);
  const lastSpace = head.lastIndexOf(' ');
  const clipped = lastSpace > EVENT_SUMMARY_MAX * 0.6 ? head.slice(0, lastSpace) : head;
  return `${clipped.trimEnd()}…`;
}

function normalizedSummary(raw: string): string {
  return raw.replace(/^\s*#{1,6}\s*/gm, '').replace(/\s+/g, ' ').trim();
}

function isLegacyFanOut(
  raw: string,
  events: ReadonlyArray<RectificationPdfEvent>,
): boolean {
  const listItems = raw.match(/(?:^|\n)\s*[-*•]\s+/g)?.length ?? 0;
  if (listItems >= 2) return true;

  const years = new Set(raw.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const matchingEventYears = new Set(
    events.map((event) => event.date.slice(0, 4)).filter((year) => years.has(year)),
  );
  return years.size >= 2 && matchingEventYears.size >= 2;
}

function repeatedLegacyFanOuts(
  events: ReadonlyArray<RectificationPdfEvent>,
): ReadonlySet<string> {
  const groups = new Map<string, RectificationPdfEvent[]>();
  for (const event of events) {
    if (event.summary) {
      const identity = normalizedSummary(event.summary);
      groups.set(identity, [...(groups.get(identity) ?? []), event]);
    }
  }
  return new Set(
    [...groups]
      .filter(([, matching]) => {
        const raw = matching[0]?.summary;
        return matching.length > 1 && raw !== undefined && isLegacyFanOut(raw, matching);
      })
      .map(([identity]) => identity),
  );
}

function buildEventsTable(
  events: ReadonlyArray<RectificationPdfEvent>,
  t: TFunction,
): ReportPdfTable {
  const repeated = repeatedLegacyFanOuts(events);
  const rows = events.map((event) => {
    const summary = event.summary ? conciseSummary(event.summary) : undefined;
    const identity = event.summary ? normalizedSummary(event.summary) : undefined;
    return {
      date: glyphSafe(event.date ? formatPredictiveDate(event.date) : '—'),
      category: glyphSafe(event.category ? t(`rectify:categories.${event.category}`) : '—'),
      summary: summary && identity && !repeated.has(identity) ? glyphSafe(summary) : undefined,
    };
  });
  const hasSummary = rows.some((row) => row.summary !== undefined);
  return hasSummary
    ? {
        headers: [
          t('rectification.col_date'),
          t('rectification.col_category'),
          t('rectification.col_event'),
        ].map((header) => glyphSafe(header)),
        rows: rows.map((row) => ({ cells: [row.date, row.category, row.summary ?? '—'] })),
        widths: [1, 1.4, 2.6],
      }
    : {
        headers: [t('rectification.col_date'), t('rectification.col_event')].map((header) =>
          glyphSafe(header),
        ),
        rows: rows.map((row) => ({ cells: [row.date, row.category] })),
        widths: [1, 4],
      };
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

/**
 * The always-present fact rows. Rigor Stage 3: the band fact carries the
 * aggregate confidence % (or "inconclusive"), and a supporting-vs-opposing
 * COUNT balance fact is added when a chosen candidate exists.
 */
function buildFacts(record: RectificationRecord, t: TFunction): ReportPdfRectification['facts'] {
  const snapshot = record.resultSnapshot ?? null;
  const conf = snapshot != null ? confidenceLine(snapshot, t) : null;
  const chosen = snapshot != null ? chosenCandidate(record, snapshot) : null;
  const bandWord = t(`rectify:band.${record.band}`);
  const rows = [
    {
      label: t('rectification.entered_label'),
      value: timeWithSign(t, record.originalTime, record.originalSign),
    },
    {
      label: t('rectification.working_label'),
      value: timeWithSign(t, record.rectifiedTime, record.rectifiedSign),
    },
    { label: t('rectification.mode_label'), value: t(`rectification.mode.${record.mode}`) },
    { label: t('rectification.band_label'), value: conf != null ? `${bandWord} · ${conf.text}` : bandWord },
    ...(chosen != null
      ? [{ label: t('rectification.evidence_balance_label'), value: evidenceBalance(chosen, t) }]
      : []),
    { label: t('rectification.confirmed_label'), value: formatReportDate(record.confirmedAt) },
  ];
  return rows.map((fact) => ({ label: glyphSafe(fact.label), value: glyphSafe(fact.value) }));
}

/** Build the pre-localized Birth Time Authority slice for the PDF. */
export function buildRectificationPdf({
  record,
  events,
  t,
}: BuildRectificationPdfInput): ReportPdfRectification {
  const facts = buildFacts(record, t);

  return {
    chrome: {
      eyebrow: glyphSafe(t('pdf.rectification_eyebrow')),
      title: glyphSafe(t('rectification.heading')),
      intro: glyphSafe(t('pdf.rectification_intro')),
    },
    facts,
    eventsHeading: glyphSafe(t('rectification.events_heading')),
    events: buildEventsTable(events, t),
    eventsEmpty: glyphSafe(t('rectification.events_empty')),
    caveat: glyphSafe(t('rectification.caveat')),
    ...buildSnapshotSlices(record, t),
  };
}
