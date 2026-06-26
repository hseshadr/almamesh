/**
 * MoonPair — the two Moons a Melapaka table reads, mapped back to PEOPLE.
 *
 * The engine speaks in table roles (bride/groom); the UI never does. The
 * explicit `role_a` resolves which Moon is the anchor's ("Your Moon") and
 * which the member's — every fact rendered verbatim.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchRole, AshtakootaData } from '@almamesh/shared-types';

import { moonsByRole, prettyNakshatra } from '../../../lib/mesh';
import { signName } from '../../../lib/predictiveEventCopy';

export interface MoonPairProps {
  readonly anchorRole: MatchRole;
  readonly ashtakoota: Pick<AshtakootaData, 'bride_moon' | 'groom_moon'>;
  readonly memberName: string;
}

export function MoonPair({ anchorRole, ashtakoota, memberName }: MoonPairProps): ReactElement {
  const { t } = useTranslation(['mesh', 'predictive']);
  const { anchorMoon, memberMoon } = moonsByRole(anchorRole, ashtakoota);
  const rows = [
    { label: t('mesh:compat.moon_you'), moon: anchorMoon },
    { label: t('mesh:compat.moon_member', { name: memberName }), moon: memberMoon },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
      {rows.map(({ label, moon }) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
            {label}
          </dt>
          <dd className="mt-1 text-sm leading-relaxed text-text-primary">
            {t('mesh:compat.moon_line', {
              nakshatra: prettyNakshatra(moon.nakshatra),
              pada: moon.nakshatra_pada,
              sign: signName(t, moon.sign),
            })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
