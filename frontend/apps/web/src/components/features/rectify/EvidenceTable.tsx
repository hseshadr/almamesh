/**
 * EvidenceTable — supporting events for ONE rectification candidate.
 *
 * Renders each `EventEvidence` as a row: polarity chip (supports vs counts
 * against), date, localized category, and each signal key translated to a
 * human phrase via the shared Spec 062 grammar parser (`lib/rectifySignals`).
 *
 * Anti-scam invariants:
 *  - The raw `contribution` score is NEVER rendered — only its SIGN drives the
 *    per-row polarity styling (no false-precision numbers, no percentages).
 *  - Raw machine signal keys never surface; unknown keys fall back to the
 *    honest "a timing signal".
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventEvidence } from '@almamesh/shared-types';
import { evidencePolarity, localizeSignal } from '../../../lib/rectifySignals';

export interface EvidenceTableProps {
  readonly events: readonly EventEvidence[];
}

export function EvidenceTable({ events }: EvidenceTableProps): ReactElement | null {
  const { t } = useTranslation('rectify');

  if (events.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-xs"
        aria-label={t('results.evidence_table_label')}
        data-testid="evidence-table"
      >
      <tbody>
        {events.map((ev) => {
          const polarity = evidencePolarity(ev.signals, ev.contribution);
          const isAgainst = polarity === 'against';
          return (
            <tr
              key={`${ev.eventIndex}-${ev.date}`}
              data-polarity={polarity}
              className="border-b border-border-subtle last:border-0"
            >
              <td className="py-1.5 pr-3 align-top whitespace-nowrap">
                <span
                  data-testid="evidence-polarity"
                  className={`text-[10px] font-medium uppercase tracking-[0.14em] ${
                    isAgainst ? 'text-status-warning' : 'text-status-success'
                  }`}
                >
                  {isAgainst ? t('results.evidence_against') : t('results.evidence_supports')}
                </span>
              </td>
              <td className="py-1.5 pr-3 align-top font-mono text-text-tertiary tabular-nums whitespace-nowrap">
                {ev.date}
              </td>
              <td className="py-1.5 pr-3 align-top text-text-secondary">
                {t(`categories.${ev.category}`)}
              </td>
              <td
                className={`py-1.5 align-top ${
                  isAgainst ? 'text-status-warning/90' : 'text-text-secondary'
                }`}
              >
                {ev.signals.map((sig, i) => (
                  <span key={sig}>
                    {localizeSignal(t, sig)}
                    {i < ev.signals.length - 1 ? '; ' : ''}
                  </span>
                ))}
              </td>
            </tr>
          );
        })}
      </tbody>
      </table>
    </div>
  );
}
