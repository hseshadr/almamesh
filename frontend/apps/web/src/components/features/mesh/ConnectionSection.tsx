/**
 * ConnectionSection — the two-way overlay: "their planets in your chart" and
 * "your planets in their chart", side by side.
 *
 * Placements are the guest grahas dropped (read-only) into the host's
 * whole-sign houses; contacts are the typed touches (close conjunction, graha
 * dṛṣṭi, same sign) with house and orb, re-ordered for display only. Contacts
 * the engine marks `heuristic` carry a † that resolves to the engine's own
 * convention string in the footnote — the convention is named, never altered.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ChartOverlayData, MeshEdgeCtx, OverlayContactData } from '@almamesh/shared-types';

import { Badge, Card } from '../../ui';
import { formatOrbDegrees, strongestContacts } from '../../../lib/mesh';
import { grahaName, signName } from '../../../lib/predictiveEventCopy';

export interface ConnectionSectionProps {
  readonly edge: MeshEdgeCtx;
  readonly memberName: string;
}

/** "on the Lagna" / "on Moon" — the host natal point a contact touches. */
function targetLabel(t: TFunction, target: OverlayContactData['target']): string {
  return target === 'lagna' ? t('mesh:connection.target_lagna') : grahaName(t, target);
}

function ContactRow({ contact }: { contact: OverlayContactData }): ReactElement {
  const { t } = useTranslation(['mesh', 'predictive']);
  return (
    <li className="text-sm leading-relaxed text-text-secondary" data-testid="mesh-contact-row">
      <span className="font-medium text-text-primary">{grahaName(t, contact.planet)}</span>{' '}
      {t(`mesh:connection.kind.${contact.kind}`)}{' '}
      {t('mesh:connection.on_target', { target: targetLabel(t, contact.target) })}
      <span className="text-text-tertiary">
        {' · '}
        {t('mesh:connection.house_n', { n: contact.host_house })}
        {contact.orb_degrees !== null && (
          <> · {t('mesh:connection.orb', { degrees: formatOrbDegrees(contact.orb_degrees) })}</>
        )}
        {contact.heuristic && <span aria-hidden="true"> †</span>}
      </span>
    </li>
  );
}

function OverlayColumn({
  heading,
  overlay,
  testid,
}: {
  heading: string;
  overlay: ChartOverlayData;
  testid: string;
}): ReactElement {
  const { t } = useTranslation(['mesh', 'predictive']);
  const contacts = strongestContacts(overlay.contacts);
  const hasHeuristic = contacts.some((contact) => contact.heuristic);
  return (
    <div className="min-w-0 space-y-4" data-testid={testid}>
      <div>
        <h3 className="text-sm font-medium text-text-primary">{heading}</h3>
        <p className="mt-0.5 text-xs text-text-tertiary">
          {t('mesh:connection.host_rising', { sign: signName(t, overlay.host_lagna_sign) })}
        </p>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
          {t('mesh:connection.placements')}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {overlay.placements.map((placement) => (
            <li
              key={placement.planet}
              className="whitespace-nowrap font-mono text-xs text-text-secondary"
            >
              {grahaName(t, placement.planet)}{' '}
              <span className="text-text-tertiary">
                {t('mesh:connection.house_n', { n: placement.host_house })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-tertiary">
          {t('mesh:connection.contacts')}
        </p>
        {contacts.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5">
            {contacts.map((contact) => (
              <ContactRow
                key={`${contact.planet}-${contact.target}-${contact.kind}`}
                contact={contact}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-text-tertiary">{t('mesh:connection.none')}</p>
        )}
        {hasHeuristic && (
          <p className="mt-2 text-xs leading-relaxed text-text-tertiary" data-testid="mesh-heuristic-note">
            {t('mesh:connection.heuristic_note', { convention: overlay.convention })}
          </p>
        )}
      </div>
    </div>
  );
}

export function ConnectionSection({ edge, memberName }: ConnectionSectionProps): ReactElement {
  const { t } = useTranslation('mesh');
  return (
    <Card
      title={t('connection.heading')}
      actions={<Badge>{t('connection.badge')}</Badge>}
      data-testid="mesh-connection"
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
        <OverlayColumn
          heading={t('connection.theirs_in_yours', { name: memberName })}
          overlay={edge.overlay.b_in_a}
          testid="mesh-overlay-b-in-a"
        />
        <OverlayColumn
          heading={t('connection.yours_in_theirs', { name: memberName })}
          overlay={edge.overlay.a_in_b}
          testid="mesh-overlay-a-in-b"
        />
      </div>
    </Card>
  );
}
