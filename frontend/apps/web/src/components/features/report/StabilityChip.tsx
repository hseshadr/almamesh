/**
 * StabilityChip — a small, honest "birth-time stable / sensitive" mark rendered
 * next to a yoga or life-domain verdict.
 *
 * Layer-1 (deterministic) certainty: whether the verdict survives BOTH candidate
 * ascendants (`holdsUnderBoth`). It is a FACT about the chart(s), never a model
 * estimate — so it carries no percentage, only a word + its plain-language aria
 * description. Renders nothing when there is no marker for the claim (e.g. an
 * older stored payload), so it never blocks a verdict from showing.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { StabilityMarker } from '../../../lib/stability';

/** The stability mark for one claim, or nothing when no marker is available. */
export function StabilityChip({
  marker,
}: {
  readonly marker?: StabilityMarker;
}): ReactElement | null {
  const { t } = useTranslation('report');
  if (!marker) {
    return null;
  }
  const variant = marker.holdsUnderBoth ? 'stable' : 'sensitive';
  return (
    <span
      className="report-stability-chip"
      data-variant={variant}
      data-testid="report-stability-chip"
      aria-label={t(`stability.${variant}_aria`)}
    >
      {t(`stability.${variant}`)}
    </span>
  );
}
