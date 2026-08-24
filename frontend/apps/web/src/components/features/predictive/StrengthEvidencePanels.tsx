import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { DomainStrengthReceipt } from '@almamesh/browser/types';
import { verifyDomainStrengthClaim } from '@almamesh/browser';
import type {
  LifeDomainForecastData,
  StrengthAssayComponentData,
} from '@almamesh/shared-types';

import { StrengthReceiptPanel } from './StrengthReceiptBadge';

type AvowStatus = 'checking' | 'verified' | 'failed' | 'unavailable';

function formatAssayPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function component(
  forecast: LifeDomainForecastData,
  id: string,
): StrengthAssayComponentData | undefined {
  return forecast.strength_assay?.components.find((candidate) => candidate.id === id);
}

interface AssayPanelProps {
  readonly forecast: LifeDomainForecastData;
  readonly avowStatus: AvowStatus;
}

function AssayPanel({ forecast, avowStatus }: AssayPanelProps): ReactElement {
  const { t } = useTranslation('predictive');
  const result = forecast.strength_assay;
  const shadbala = component(forecast, 'shadbala_pct');
  const sav = component(forecast, 'sav_pct');
  const selected = result?.components.find((candidate) => candidate.id === result.selected_component_id);
  const withheld = avowStatus === 'checking' || avowStatus === 'failed';

  return (
    <section
      className="rounded-lg border border-ui-border bg-background-darker px-3 py-3"
      data-testid={`domain-assay-${forecast.domain}`}
    >
      <h4 className="text-xs uppercase tracking-wider text-text-muted">
        {t('domains.assay_heading')}
      </h4>
      {withheld ? (
        <p className="mt-2 text-xs text-text-muted">{t('domains.assay_withheld')}</p>
      ) : result && shadbala && sav && selected ? (
        <div className="mt-2 space-y-2 text-xs text-text-secondary">
          <p>{t('domains.assay_method')}</p>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
            <dt>{t('domains.assay_shadbala')}</dt>
            <dd className="font-mono text-text-primary">{formatAssayPct(shadbala.raw)}</dd>
            <dt>{t('domains.assay_sav')}</dt>
            <dd className="font-mono text-text-primary">{formatAssayPct(sav.raw)}</dd>
            <dt>{t('domains.assay_result')}</dt>
            <dd className="font-mono text-accent-gold" data-assay-result>
              {formatAssayPct(selected.raw)}
            </dd>
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-xs text-text-muted">{t('domains.assay_unavailable')}</p>
      )}
    </section>
  );
}

function statusClass(status: AvowStatus): string {
  if (status === 'verified') return 'border-status-success/40 text-status-success';
  if (status === 'failed') return 'border-status-error/50 text-status-error';
  return 'border-ui-border text-text-muted';
}

function useAvowStatus(
  receipt: DomainStrengthReceipt | undefined,
  signerPublicKey: string | undefined,
  forecast: LifeDomainForecastData,
): AvowStatus {
  const available = receipt !== undefined && signerPublicKey !== undefined;
  const [status, setStatus] = useState<AvowStatus>(available ? 'checking' : 'unavailable');

  useEffect(() => {
    if (!receipt || !signerPublicKey) {
      setStatus('unavailable');
      return;
    }
    let active = true;
    setStatus('checking');
    void verifyDomainStrengthClaim(
      receipt,
      signerPublicKey,
      forecast.domain,
      forecast.strength_summary,
      forecast.strength_assay,
    ).then(
      () => {
        if (active) setStatus('verified');
      },
      () => {
        if (active) setStatus('failed');
      },
    );
    return () => {
      active = false;
    };
  }, [
    forecast.domain,
    forecast.strength_assay,
    forecast.strength_summary,
    receipt,
    signerPublicKey,
  ]);

  return status;
}

interface AvowPanelProps {
  readonly domain: string;
  readonly receipt?: DomainStrengthReceipt;
  readonly signerPublicKey?: string;
  readonly showReceiptDetails: boolean;
  readonly status: AvowStatus;
}

function AvowPanel({
  domain,
  receipt,
  signerPublicKey,
  showReceiptDetails,
  status,
}: AvowPanelProps): ReactElement {
  const { t } = useTranslation('predictive');
  const statusBadge = (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 font-mono ${statusClass(status)}`}
      data-status={status}
      role="status"
    >
      {t(`domains.avow_status.${status}`)}
    </span>
  );
  return (
    <section
      className="rounded-lg border border-ui-border bg-background-darker px-3 py-3"
      data-status={status}
      data-testid={`domain-avow-${domain}`}
    >
      <h4 className="text-xs uppercase tracking-wider text-text-muted">
        {t('domains.avow_heading')}
      </h4>
      <div className="mt-2 space-y-2 text-xs text-text-secondary">
        {receipt && signerPublicKey ? (
          <div data-testid={`domain-receipt-${domain}`}>{statusBadge}</div>
        ) : (
          statusBadge
        )}
        <p>{t('domains.avow_scope')}</p>
        {showReceiptDetails && status === 'verified' && receipt && signerPublicKey ? (
          <StrengthReceiptPanel receipt={receipt} expectedPublicKey={signerPublicKey} />
        ) : null}
      </div>
    </section>
  );
}

export interface StrengthEvidencePanelsProps {
  readonly forecast: LifeDomainForecastData;
  readonly receipt?: DomainStrengthReceipt;
  readonly signerPublicKey?: string;
  readonly showReceiptDetails?: boolean;
}

export function StrengthEvidencePanels({
  forecast,
  receipt,
  signerPublicKey,
  showReceiptDetails = false,
}: StrengthEvidencePanelsProps): ReactElement {
  const status = useAvowStatus(receipt, signerPublicKey, forecast);
  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2"
      data-testid={`domain-strength-evidence-${forecast.domain}`}
    >
      <AssayPanel forecast={forecast} avowStatus={status} />
      <AvowPanel
        domain={forecast.domain}
        receipt={receipt}
        signerPublicKey={signerPublicKey}
        showReceiptDetails={showReceiptDetails}
        status={status}
      />
    </div>
  );
}
