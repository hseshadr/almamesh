/**
 * GrahaMaitriLead — the lead card for family/friend/business edges.
 *
 * Of the eight marriage kootas, the friendship of the two Moon-sign lords is
 * the one that generalizes beyond marriage, so non-marriage edges open with it
 * — score and basis verbatim — while the full Ashtakoota/Mangal tables stay
 * reserved for spouse/partner edges (the curation rule, stated in the note).
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeshEdgeCtx } from '@almamesh/shared-types';

import { Badge, Card } from '../../ui';
import { kootaOf } from '../../../lib/mesh';
import { MoonPair } from './MoonPair';

export interface GrahaMaitriLeadProps {
  readonly edge: MeshEdgeCtx;
  readonly memberName: string;
}

export function GrahaMaitriLead({ edge, memberName }: GrahaMaitriLeadProps): ReactElement | null {
  const { t } = useTranslation('mesh');
  const maitri = kootaOf(edge.ashtakoota, 'graha_maitri');
  if (!maitri) {
    return null;
  }
  return (
    <Card
      title={t('maitri.heading')}
      actions={<Badge>{t('maitri.badge')}</Badge>}
      data-testid="mesh-maitri"
    >
      <div className="space-y-5">
        <p className="flex items-baseline gap-x-3">
          <span className="font-display text-3xl leading-none text-text-primary">
            {maitri.earned}
          </span>
          <span className="text-sm text-text-secondary">
            {t('compat.of_max', { max: maitri.maximum })}
          </span>
        </p>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">{maitri.basis}</p>

        <MoonPair anchorRole={edge.role_a} ashtakoota={edge.ashtakoota} memberName={memberName} />

        <p className="max-w-prose border-t border-ui-border/60 pt-3 text-xs leading-relaxed text-text-tertiary">
          {t('maitri.note')} · {maitri.source}
        </p>
      </div>
    </Card>
  );
}
