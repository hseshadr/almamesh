/**
 * Tiny shared badges for the predictive surfaces: transit severity and
 * strength band, both rendered from engine enums via the `predictive`
 * namespace — no derived judgement, just localized labels + palette mapping.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { StrengthBand, TransitSeverity } from '@almamesh/shared-types';
import { Badge } from '../../ui';

const SEVERITY_VARIANT = {
  supportive: 'success',
  neutral: 'default',
  challenging: 'warning',
} as const;

export function SeverityBadge({ severity }: { severity: TransitSeverity }): ReactElement {
  const { t } = useTranslation('predictive');
  return <Badge variant={SEVERITY_VARIANT[severity]}>{t(`severity.${severity}`)}</Badge>;
}

const BAND_VARIANT = {
  strong: 'success',
  moderate: 'brass',
  weak: 'warning',
} as const;

export function BandBadge({ band }: { band: StrengthBand }): ReactElement {
  const { t } = useTranslation('predictive');
  return (
    <Badge variant={BAND_VARIANT[band]} data-testid={`band-${band}`}>
      {t(`domains.band.${band}`)}
    </Badge>
  );
}
