/**
 * ReportDomains — the printed life-domain forecasts: one almanac block per
 * domain with the strength band + key-graha line, the current emphasis and the
 * dated upcoming windows. Engine DomainsCtx verbatim — the deterministic
 * synthesis, not AI narration.
 */

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DomainsCtx, LifeDomainForecastData } from '@almamesh/shared-types';
import { formatPct, formatPredictiveDate, formatRupas } from '../../../lib/predictive';
import { domainWindowLabel, grahaName } from '../../../lib/predictiveEventCopy';
import { domainClaimId, type StabilityMarker } from '../../../lib/stability';
import { DOMAIN_ORDER } from '../predictive/DomainsPanel';
import { ReportSectionHeading } from './ReportSectionHeading';
import { StabilityChip } from './StabilityChip';

function DomainBlock({
  forecast,
  marker,
}: {
  forecast: LifeDomainForecastData;
  marker?: StabilityMarker;
}): ReactElement {
  const { t } = useTranslation('report');
  const { t: tp } = useTranslation('predictive');
  const strength = forecast.strength_summary;
  const emphasis = forecast.current_emphasis;
  return (
    <div className="report-domain-block report-avoid-break" data-testid={`report-domain-${forecast.domain}`}>
      <div className="report-domain-head">
        <h3>{tp(`domains.names.${forecast.domain}`)}</h3>
        <span className="report-domain-marks">
          <span className="report-domain-band">
            <span className="report-strength-pct">{formatPct(strength.strength_pct)}</span>
            {' · '}
            {tp(`domains.band.${strength.band}`)}
            {strength.approximated ? ' ≈' : ''}
          </span>
          <StabilityChip marker={marker} />
        </span>
      </div>
      <p className="report-domain-line report-strength-ledger">
        {tp('domains.strength_axes', {
          shadbala: formatPct(strength.shadbala_pct),
          sav: formatPct(strength.sav_pct),
        })}
        {' · '}
        <span className="report-strength-tier">{tp('domains.strength_tier_model')}</span>
      </p>
      <p className="report-domain-line">
        {tp('domains.strength_line', {
          graha: grahaName(tp, strength.key_graha),
          rupas: formatRupas(strength.key_graha_rupas),
          bindus: strength.sav_bindus,
        })}
      </p>
      <p className="report-domain-line">
        {emphasis.active_dasha_significator
          ? tp('domains.active_dasha', { levels: emphasis.dasha_levels.join(' · ') })
          : tp('domains.no_active_dasha')}
        {emphasis.matched_dasha_lords.length > 0 && (
          <>
            {' '}
            {tp('domains.matched_lords', {
              lords: emphasis.matched_dasha_lords.map((lord) => grahaName(tp, lord)).join(', '),
            })}
          </>
        )}
        {' · '}
        {tp('domains.transit_tone', {
          severity: tp(`severity.${emphasis.transit_severity}`),
        })}
        {emphasis.under_sade_sati ? ` · ${tp('domains.under_sade_sati')}` : ''}
        {emphasis.approximated ? ` (${tp('domains.approx_mark')})` : ''}
      </p>
      <p className="report-domain-windows-label">{t('domains.windows_heading')}</p>
      {forecast.upcoming_windows.length === 0 ? (
        <p className="report-domain-line">{t('domains.windows_empty')}</p>
      ) : (
        <ul className="report-domain-windows">
          {forecast.upcoming_windows.map((window) => (
            <li key={`${window.date}-${window.descriptor}`}>
              {formatPredictiveDate(window.date)} — {domainWindowLabel(tp, window)} (
              {tp(`domains.source.${window.source}`)}, {tp(`severity.${window.severity}`)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ReportDomainsProps {
  readonly domainsCtx: DomainsCtx;
  /**
   * OPTIONAL per-claim birth-time-stability markers, keyed by `domain:<domain>`.
   * When present, each domain shows whether its strength band survives both
   * candidate ascendants (Stage-4 stable-vs-lagna).
   */
  readonly stability?: ReadonlyMap<string, StabilityMarker>;
}

/** The seven life-domain forecast blocks for print. */
export function ReportDomains({ domainsCtx, stability }: ReportDomainsProps): ReactElement {
  const { t } = useTranslation('report');
  return (
    <section className="report-section" data-testid="report-domains">
      <ReportSectionHeading index="X" title={t('domains.heading')} />
      <div className="report-domain-grid">
        {DOMAIN_ORDER.map((domain) => (
          <DomainBlock
            key={domain}
            forecast={domainsCtx.forecasts[domain]}
            marker={stability?.get(domainClaimId(domain))}
          />
        ))}
      </div>
    </section>
  );
}
