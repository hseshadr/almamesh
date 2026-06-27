/**
 * CandidateCard — one ranked rectification candidate.
 *
 * Anti-scam invariants:
 *  - NO percentage anywhere — `fitScore` and `contribution` are never shown.
 *  - The representative time is clearly labelled as a window estimate, not an
 *    exact-minute claim.
 *  - The rising sign is the engine's verbatim output (title-cased for display).
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { RectificationCandidate } from '@almamesh/shared-types';
import { EvidenceTable } from './EvidenceTable';

export interface CandidateCardProps {
  readonly candidate: RectificationCandidate;
  /** 1-based rank label shown to the user. */
  readonly rank: number;
  readonly onConfirm: (candidate: RectificationCandidate) => void;
}

/** "pisces" / "PISCES" → "Pisces" */
function titleCase(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1).toLowerCase();
}

export function CandidateCard({ candidate, rank, onConfirm }: CandidateCardProps): ReactElement {
  const { t } = useTranslation('rectify');

  return (
    <div
      data-testid="candidate-card"
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-secondary p-4"
    >
      {/* Rank + Sign */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-tertiary">
            {t('results.candidate_label', { rank })}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-text-primary">
            {titleCase(candidate.ascendantSign)}
          </p>
        </div>
      </div>

      {/* Representative time */}
      <div className="rounded-md border border-border-subtle bg-surface-primary px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-text-tertiary">
          {t('results.representative_time_label')}
        </p>
        <p className="mt-0.5 font-mono text-sm font-medium text-text-primary">
          {candidate.representativeTimeLocal}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-text-secondary italic">
          {t('results.representative_caveat')}
        </p>
      </div>

      {/* Supporting events */}
      {candidate.supportingEvents.length > 0 && (
        <div>
          <EvidenceTable events={candidate.supportingEvents} />
        </div>
      )}

      {/* Confirm action */}
      <button
        type="button"
        data-testid="confirm-button"
        onClick={() => onConfirm(candidate)}
        className="mt-1 w-full rounded-md bg-accent-gold px-4 py-2 text-sm font-semibold text-background-primary transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-gold focus:ring-offset-2 focus:ring-offset-surface-secondary"
      >
        {t('results.confirm')}
      </button>
    </div>
  );
}
