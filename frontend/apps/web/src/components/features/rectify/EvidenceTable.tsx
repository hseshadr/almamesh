/**
 * EvidenceTable — supporting events for ONE rectification candidate.
 *
 * Renders each `EventEvidence` as a row: date, localized category, and each
 * signal key translated to a human phrase. The raw `contribution` score is
 * NEVER rendered — the anti-scam mandate forbids false-precision percentages.
 *
 * Signal machine keys follow the pattern `<type>_h<N>` where N is a house
 * number (1–12). They are parsed and localized via the `rectify` i18n namespace
 * signals.* keys rather than displayed verbatim.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventEvidence } from '@almamesh/shared-types';

export interface EvidenceTableProps {
  readonly events: readonly EventEvidence[];
}

/** English ordinal suffix: 1→1st, 2→2nd, 3→3rd, 4→4th … */
function ordinalEn(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

type SignalType = 'dasha_lord_rules' | 'dasha_lord_in' | 'slow_transit';
const SIGNAL_RE = /^(dasha_lord_rules|dasha_lord_in|slow_transit)_h(\d+)$/;

function parseSignalKey(key: string): { tKey: string; house: number } | null {
  const match = SIGNAL_RE.exec(key);
  if (!match) return null;
  return {
    tKey: `signals.${match[1] as SignalType}`,
    house: parseInt(match[2], 10),
  };
}

export function EvidenceTable({ events }: EvidenceTableProps): ReactElement | null {
  const { t } = useTranslation('rectify');

  if (events.length === 0) return null;

  function localizeSignal(key: string): string {
    const parsed = parseSignalKey(key);
    if (!parsed) return t('signals.unknown');
    return t(parsed.tKey, { house: parsed.house, houseOrdinal: ordinalEn(parsed.house) });
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-xs"
        aria-label={t('results.evidence_table_label')}
        data-testid="evidence-table"
      >
      <tbody>
        {events.map((ev) => (
          <tr
            key={`${ev.eventIndex}-${ev.date}`}
            className="border-b border-border-subtle last:border-0"
          >
            <td className="py-1.5 pr-3 font-mono text-text-tertiary tabular-nums whitespace-nowrap">
              {ev.date}
            </td>
            <td className="py-1.5 pr-3 text-text-secondary">
              {t(`categories.${ev.category}`)}
            </td>
            <td className="py-1.5 text-text-secondary">
              {ev.signals.map((sig, i) => (
                <span key={sig}>
                  {localizeSignal(sig)}
                  {i < ev.signals.length - 1 ? '; ' : ''}
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}
