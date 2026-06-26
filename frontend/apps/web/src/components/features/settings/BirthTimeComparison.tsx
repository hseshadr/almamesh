/**
 * BirthTimeComparison — ONE chart, two candidate birth times.
 *
 * Near a sign boundary, birth-time rectification poses one honest question: the
 * recorded minute and a rectified minute can put the Ascendant in two different
 * signs — and a different rising sign shifts EVERY house by one. This block makes
 * that explicit. When the rectified time has crossed the boundary it shows the
 * rising sign the as-recorded time produces beside the one the rectified time
 * produces, so it is unmistakable that these are the SAME person at two
 * candidate times — a possibility to weigh against lived events, never a verdict.
 * Before any crossing it simply names the neighbouring sign a few minutes would
 * reach.
 *
 * Pure + display-only: both signs are the engine's own output (computed live by
 * the parent through `useLagnaPreview`); this component never recomputes
 * astrology — it only measures distance to the boundary via the passed CuspInfo.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { CuspInfo } from '../../../lib/lagnaCusp';
import { formatDegree } from '../../../lib/reportData';

/** A rising-sign read-out for one candidate birth time. */
export interface CandidateReading {
  /** Display clock for this candidate ("06:44"); display-only. */
  readonly time: string;
  /** Engine rising-sign name (any casing). */
  readonly sign: string;
  /** In-sign degrees (0..30) as computed by the engine. */
  readonly signDegrees: number;
}

export interface BirthTimeComparisonProps {
  /** Rising sign the ENTERED (as-recorded) birth time produces. */
  readonly recorded: CandidateReading | null;
  /** Rising sign the RECTIFIED birth time produces. */
  readonly rectified: CandidateReading | null;
  /** Engine-grounded near-cusp descriptor for the recorded reading (gate + neighbour). */
  readonly cusp: CuspInfo | null;
}

/** "leo"/"LEO" -> "Leo" (engine sign names are proper nouns). */
function titleCase(sign: string): string {
  return sign.length === 0 ? sign : sign[0].toUpperCase() + sign.slice(1).toLowerCase();
}

function Column({ heading, reading }: { heading: string; reading: CandidateReading }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-tertiary">{heading}</p>
      <p className="mt-1 text-sm font-medium text-text-primary">{titleCase(reading.sign)}</p>
      <p className="font-mono text-xs text-text-secondary">
        {formatDegree(reading.signDegrees)} · {reading.time}
      </p>
    </div>
  );
}

export function BirthTimeComparison({
  recorded,
  rectified,
  cusp,
}: BirthTimeComparisonProps): ReactElement | null {
  const { t } = useTranslation('settings');

  const flips =
    recorded != null &&
    rectified != null &&
    recorded.sign.toLowerCase() !== rectified.sign.toLowerCase();

  // Only meaningful near a sign boundary, or once a rectification has crossed
  // one. Mid-sign with matching candidate times -> nothing to compare.
  if (!flips && cusp == null) {
    return null;
  }
  const current = rectified ?? recorded;
  if (current == null) {
    return null;
  }

  return (
    <div
      data-testid="birth-time-comparison"
      className="mt-4 rounded-md border border-status-warning/40 bg-status-warning/5 px-3.5 py-3"
      role="note"
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-status-warning">
        {t('profile.comparison_label')}
      </p>

      {flips && recorded != null && rectified != null ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <Column heading={t('profile.comparison_as_recorded')} reading={recorded} />
            <Column heading={t('profile.comparison_rectified')} reading={rectified} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-text-secondary">
            {t('profile.comparison_flip', {
              recorded: titleCase(recorded.sign),
              rectified: titleCase(rectified.sign),
            })}
          </p>
        </>
      ) : cusp != null ? (
        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
          {t('profile.comparison_near', {
            sign: titleCase(current.sign),
            degrees: cusp.degrees.toFixed(1),
            neighbour: cusp.neighbourSign,
          })}
        </p>
      ) : null}
    </div>
  );
}

export default BirthTimeComparison;
