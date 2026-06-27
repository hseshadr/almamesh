/**
 * RectifyResults — honest rectification results surface.
 *
 * Anti-scam mandate (enforced at this render boundary):
 *  - NEVER a headline percentage — `fitScore` / `margin` / `contribution` are
 *    never shown to the user.
 *  - `near_tie` band: BOTH top candidates are shown side by side with an
 *    explicit "only a recorded birth time can settle a near-tie" note.
 *  - `leans` band: labeled as a hypothesis, not a verdict.
 *  - `consistent` band: the leading candidate is highlighted with the honest
 *    caveat that no algorithm replaces a recorded birth certificate.
 *  - The honesty note comes verbatim from the engine via `honestyNoteKey`.
 *  - Representative times are labeled as window estimates, never exact minutes.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { RectificationCandidate, RectificationResult } from '@almamesh/shared-types';
import {
  BirthTimeComparison,
  type CandidateReading,
} from '../settings/BirthTimeComparison';
import { cuspInfo } from '../../../lib/lagnaCusp';
import { CandidateCard } from './CandidateCard';

export interface RectifyResultsProps {
  readonly result: RectificationResult;
  /** The as-recorded time reading to show as a reference; null when unknown. */
  readonly recordedReading: CandidateReading | null;
  readonly onConfirm: (candidate: RectificationCandidate) => void;
  readonly onKeepRecorded: () => void;
}

/** Band label color by confidence level. */
function bandClass(band: RectificationResult['band']): string {
  if (band === 'consistent') return 'text-status-success';
  if (band === 'leans') return 'text-accent-blue';
  return 'text-status-warning'; // near_tie
}

/** Build a CandidateReading from a RectificationCandidate for BirthTimeComparison. */
function candidateReading(c: RectificationCandidate): CandidateReading {
  // lagnaLongitudeDeg is absolute ecliptic longitude; in-sign degrees = mod 30.
  return {
    time: c.representativeTimeLocal,
    sign: c.ascendantSign,
    signDegrees: c.lagnaLongitudeDeg % 30,
  };
}

/**
 * The engine's honestyNoteKey is prefixed with the namespace, e.g.
 * "rectify.honesty.consistent". Strip that prefix so it resolves cleanly
 * inside the `rectify` namespace via useTranslation('rectify').
 */
function stripNsPrefix(key: string, ns: string): string {
  const prefix = `${ns}.`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

export function RectifyResults({
  result,
  recordedReading,
  onConfirm,
  onKeepRecorded,
}: RectifyResultsProps): ReactElement {
  const { t } = useTranslation('rectify');

  const { band, candidates, honestyNoteKey } = result;
  const honestyKey = stripNsPrefix(honestyNoteKey, 'rectify');
  const topCandidate = candidates[0];

  // For the BirthTimeComparison: recorded vs top rectified candidate.
  const rectifiedReading = topCandidate != null ? candidateReading(topCandidate) : null;
  const cusp =
    topCandidate != null
      ? cuspInfo(topCandidate.ascendantSign, topCandidate.lagnaLongitudeDeg % 30)
      : null;

  const isNearTie = band === 'near_tie';

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header: band label + honesty note ──────────────────────────── */}
      <div>
        <p
          data-testid="band-label"
          className={`text-xs font-semibold uppercase tracking-[0.18em] ${bandClass(band)}`}
        >
          {t(`band.${band}`)}
        </p>
        <p
          data-testid="honesty-note"
          className="mt-2 text-sm leading-relaxed text-text-secondary"
        >
          {t(honestyKey)}
        </p>
      </div>

      {/* ── Near-tie settle note ────────────────────────────────────────── */}
      {isNearTie && (
        <div
          data-testid="near-tie-settle-note"
          className="rounded-md border border-status-warning/40 bg-status-warning/5 px-4 py-3"
          role="note"
        >
          <p className="text-sm leading-relaxed text-status-warning">
            {t('results.near_tie_settle_note')}
          </p>
        </div>
      )}

      {/* ── Candidate cards ─────────────────────────────────────────────── */}
      {isNearTie ? (
        /* Near-tie: top 2 candidates side by side */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {candidates.slice(0, 2).map((candidate, index) => (
            <CandidateCard
              key={candidate.ascendantSign + candidate.representativeTimeLocal}
              candidate={candidate}
              rank={index + 1}
              onConfirm={onConfirm}
            />
          ))}
        </div>
      ) : (
        /* Leans / consistent: ranked list */
        <div className="flex flex-col gap-4">
          {candidates.map((candidate, index) => (
            <CandidateCard
              key={candidate.ascendantSign + candidate.representativeTimeLocal}
              candidate={candidate}
              rank={index + 1}
              onConfirm={onConfirm}
            />
          ))}
        </div>
      )}

      {/* ── Recorded-time reference ─────────────────────────────────────── */}
      <div data-testid="recorded-reference">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-tertiary">
          {t('results.recorded_reference_label')}
        </p>
        {recordedReading != null && rectifiedReading != null && (
          <BirthTimeComparison
            recorded={recordedReading}
            rectified={rectifiedReading}
            cusp={cusp}
          />
        )}
      </div>

      {/* ── Keep recorded action ─────────────────────────────────────────── */}
      <button
        type="button"
        data-testid="keep-recorded-button"
        onClick={onKeepRecorded}
        className="w-full rounded-md border border-border-subtle px-4 py-2 text-sm text-text-secondary transition-colors hover:border-text-tertiary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-background-primary"
      >
        {t('results.keep_recorded')}
      </button>
    </div>
  );
}
