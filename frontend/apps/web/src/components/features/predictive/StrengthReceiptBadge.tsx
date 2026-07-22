/**
 * StrengthReceiptBadge / StrengthReceiptPanel — surface the SIGNED, offline-
 * verifiable per-domain strength receipt ON SCREEN, not only on the silent PDF
 * export path.
 *
 * These wrap the shared, framework-agnostic `@edgeproc/receipt-ui` views as the
 * engine and add exactly the almamesh-specific layer: the injected
 * `verifyDomainStrength` verifier, the pinned per-boot signer key, and a
 * covenant-respecting payload body that shows the calibrated BAND + tier — never
 * a fabricated percentage. The no-fake-precision covenant gains a VISIBLE proof
 * without gaining a claim.
 *
 * WHAT IT PROVES. A sealed receipt is TAMPER-EVIDENCE for the stored/exported
 * summary, not an attestation of who computed it: the signer is generated per
 * Worker boot and never leaves the device (see `strengthReceipt.ts`). The badge
 * is fail-closed — only a resolved verify under the pinned key reads "Verified".
 *
 * THE ONE SEAM. `DomainStrengthReceipt` IS `SignedReceipt<DomainStrengthSubject>`
 * by construction, but a named interface has no index signature, so TypeScript
 * cannot see it satisfies the component's `S extends JsonValue` bound. We adapt
 * at the CALL SITE — casting the envelope through `JsonValue`, never touching the
 * published component — the type-level twin of `@almamesh/browser`'s value-level
 * `asJsonSubject` seam.
 */

import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { JsonValue, SignedReceipt } from '@edgeproc/avow';
import { ReceiptBadge, ReceiptPanel, type VerifyFn } from '@edgeproc/receipt-ui';
import { verifyDomainStrength } from '@almamesh/browser';
import type { DomainStrengthReceipt, DomainStrengthSubject } from '@almamesh/browser/types';

import { BandBadge } from './PredictiveBadges';

/** The single documented adapter: a domain receipt viewed as a JSON receipt. */
type JsonReceipt = SignedReceipt<JsonValue>;
const asJsonReceipt = (receipt: DomainStrengthReceipt): JsonReceipt =>
  receipt as unknown as JsonReceipt;

/** The inverse view: the JSON receipt handed back by the generic component IS
 * the domain receipt `asJsonReceipt` fed it. */
const asDomainReceipt = (receipt: JsonReceipt): DomainStrengthReceipt =>
  receipt as unknown as DomainStrengthReceipt;

/**
 * Inject almamesh's fail-closed domain verifier into the generic view.
 * A typed adapter, not a function-wide cast: the arrow's signature is checked
 * against `VerifyFn<JsonValue>` (argument order, arity, `Promise<void>` return
 * all enforced by the compiler), and the only unchecked step left is narrowing
 * the JSON envelope back to the domain receipt via `asDomainReceipt`.
 */
const verify: VerifyFn<JsonValue> = (receipt, expectedPublicKey) =>
  verifyDomainStrength(asDomainReceipt(receipt), expectedPublicKey);

export interface StrengthReceiptViewProps {
  readonly receipt: DomainStrengthReceipt;
  readonly expectedPublicKey: string;
}

/** Compact, per-domain on-screen verdict for a sealed strength receipt. */
export function StrengthReceiptBadge({
  receipt,
  expectedPublicKey,
}: StrengthReceiptViewProps): ReactElement {
  return (
    <ReceiptBadge
      receipt={asJsonReceipt(receipt)}
      expectedPublicKey={expectedPublicKey}
      verify={verify}
    />
  );
}

/**
 * Covenant-respecting payload body: the localized domain name, its calibrated
 * strength band, and the honest tier caption — and DELIBERATELY no percentage.
 */
function PayloadBody({ subject }: { subject: DomainStrengthSubject }): ReactElement {
  const { t } = useTranslation('predictive');
  return (
    <div
      data-testid={`domain-receipt-panel-${subject.domain}`}
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary"
    >
      <span className="text-text-primary">{t(`domains.names.${subject.domain}`)}</span>
      <BandBadge band={subject.summary.band} />
      <span className="text-xs text-text-tertiary">{t('domains.strength_tier_model')}</span>
    </div>
  );
}

/** Full, per-domain receipt view: verdict + envelope + covenant-safe payload. */
export function StrengthReceiptPanel({
  receipt,
  expectedPublicKey,
}: StrengthReceiptViewProps): ReactElement {
  const renderPayload = (): ReactNode => <PayloadBody subject={receipt.payload} />;
  return (
    <ReceiptPanel
      receipt={asJsonReceipt(receipt)}
      expectedPublicKey={expectedPublicKey}
      verify={verify}
      renderPayload={renderPayload}
    />
  );
}
