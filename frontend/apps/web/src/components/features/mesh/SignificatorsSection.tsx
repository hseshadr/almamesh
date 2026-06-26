/**
 * SignificatorsSection — "Corroboration": the classical house + kāraka reading
 * for this relation, in BOTH charts, side by side (e.g. your 7th and its lord
 * next to theirs).
 *
 * Every condition (sign, house, dignity, retrograde/combust) and every
 * citation is the engine's verbatim output. The two columns let the reader see
 * whether the charts corroborate each other — the page draws no conclusion.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  GrahaConditionData,
  MeshEdgeCtx,
  RelationSignificatorsData,
} from '@almamesh/shared-types';

import { Badge, Card } from '../../ui';
import { grahaName, signName } from '../../../lib/predictiveEventCopy';

export interface SignificatorsSectionProps {
  readonly edge: MeshEdgeCtx;
  readonly memberName: string;
}

/** "exalted, house 3 · retrograde" — a graha's observable condition. */
function conditionLine(t: TFunction, condition: GrahaConditionData): string {
  const flags = [
    condition.is_retrograde ? t('mesh:signif.retrograde') : null,
    condition.is_combust ? t('mesh:signif.combust') : null,
  ].filter((flag): flag is string => flag !== null);
  const base = t('mesh:signif.lord_line', {
    lord: grahaName(t, condition.planet),
    dignity: t(`predictive:dignity.${condition.dignity}`),
    house: condition.house,
  });
  return flags.length > 0 ? `${base} · ${flags.join(' · ')}` : base;
}

function SignificatorColumn({
  label,
  data,
  testid,
}: {
  label: string;
  data: RelationSignificatorsData;
  testid: string;
}): ReactElement {
  const { t } = useTranslation(['mesh', 'predictive']);
  return (
    <div className="min-w-0 space-y-3" data-testid={testid}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
        {label}
      </p>
      <div>
        <h3 className="font-display text-base text-text-primary">
          {t('mesh:signif.house_title', {
            n: data.karaka_house,
            sign: signName(t, data.house_sign),
          })}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {conditionLine(t, data.lord_condition)}
        </p>
      </div>

      <div>
        <p className="text-xs text-text-tertiary">{t('mesh:signif.occupants')}</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          {data.occupants.length > 0
            ? data.occupants.map((planet) => grahaName(t, planet)).join(' · ')
            : t('mesh:signif.occupants_none')}
        </p>
      </div>

      <div>
        <p className="text-xs text-text-tertiary">{t('mesh:signif.karakas')}</p>
        <ul className="mt-0.5 space-y-1">
          {data.karakas.map((karaka) => (
            <li key={karaka.condition.planet} className="text-sm leading-relaxed text-text-secondary">
              {conditionLine(t, karaka.condition)}
              <span className="block text-xs text-text-tertiary">{karaka.source}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs leading-relaxed text-text-tertiary">{data.house_basis}</p>
    </div>
  );
}

export function SignificatorsSection({
  edge,
  memberName,
}: SignificatorsSectionProps): ReactElement {
  const { t } = useTranslation('mesh');
  return (
    <Card
      title={t('signif.heading')}
      actions={<Badge>{t('signif.badge')}</Badge>}
      data-testid="mesh-significators"
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
        <SignificatorColumn
          label={t('signif.you_col')}
          data={edge.significators_a}
          testid="mesh-significators-anchor"
        />
        <SignificatorColumn
          label={t('signif.member_col', { name: memberName })}
          data={edge.significators_b}
          testid="mesh-significators-member"
        />
      </div>
    </Card>
  );
}
