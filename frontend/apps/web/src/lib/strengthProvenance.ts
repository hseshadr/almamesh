/**
 * strengthProvenance — check every domain-strength receipt on the export path
 * against the pinned per-boot signer, WITHOUT ever aborting the export.
 *
 * WHAT THIS PROVES AND DOES NOT PROVE. A receipt's signing key is generated
 * fresh inside the Worker on every boot and never leaves the device, so it
 * does NOT survive a reload and identifies no one. Verifying a receipt only
 * shows that the current `StrengthSummary` matches what THIS boot sealed —
 * TAMPER-EVIDENCE for a stored/exported figure, never a correctness claim or
 * an attestation of who computed it. Nothing here may be described as "verified authenticity",
 * "certified", or "attested" — only as "confirmed unchanged since sealing" or
 * its negation.
 *
 * WHY ONE BAD RECEIPT MUST NOT ABORT THE REST. The PDF export renders seven
 * independent domains; a single corrupted or cross-signer receipt is a fact
 * about ONE domain, not a reason to withhold the other six. Every receipt is
 * checked independently and a failure is recorded, never thrown — the caller
 * decides what to do with `failed` (see `buildDomainsSection`, which withholds
 * only the numeric percentage for the domains named there).
 */

import { verifyDomainStrength, verifyDomainStrengthClaim } from '@almamesh/browser';
import type {
  DomainStrengthAssayResult,
  DomainStrengthReceipt,
  StrengthSummary,
} from '@almamesh/browser/types';

export interface StrengthProvenance {
  /** Domains whose receipt verified against the pinned signer. */
  readonly verified: ReadonlySet<string>;
  /** Domains whose receipt was PRESENT but FAILED verification. */
  readonly failed: readonly string[];
  /** The signer these receipts were checked against. */
  readonly signerPublicKey: string;
}

interface DomainOutcome {
  readonly domain: string;
  readonly ok: boolean;
}

/** Verify one domain's receipt; never throws — a failure becomes `ok: false`. */
async function checkOne(
  domain: string,
  receipt: DomainStrengthReceipt,
  signerPublicKey: string,
  currentSummaries?: Readonly<Record<string, StrengthSummary>>,
  currentAssays?: Readonly<Record<string, DomainStrengthAssayResult | undefined>>,
): Promise<DomainOutcome> {
  try {
    if (currentSummaries) {
      const summary = currentSummaries[domain];
      if (!summary) return { domain, ok: false };
      await verifyDomainStrengthClaim(
        receipt,
        signerPublicKey,
        domain,
        summary,
        currentAssays?.[domain],
      );
    } else {
      await verifyDomainStrength(receipt, signerPublicKey);
    }
    return { domain, ok: true };
  } catch {
    return { domain, ok: false };
  }
}

/**
 * Verify EVERY receipt in `receipts` against `signerPublicKey`, independently.
 * Resolves with the split, in the input's domain order — never rejects, and
 * an empty map resolves to an empty split.
 */
export async function verifyStrengthProvenance(
  receipts: Readonly<Record<string, DomainStrengthReceipt>>,
  signerPublicKey: string,
  currentSummaries?: Readonly<Record<string, StrengthSummary>>,
  currentAssays?: Readonly<Record<string, DomainStrengthAssayResult | undefined>>,
): Promise<StrengthProvenance> {
  const outcomes = await Promise.all(
    Object.entries(receipts).map(([domain, receipt]) =>
      checkOne(domain, receipt, signerPublicKey, currentSummaries, currentAssays),
    ),
  );

  return {
    verified: new Set(outcomes.filter((o) => o.ok).map((o) => o.domain)),
    failed: outcomes.filter((o) => !o.ok).map((o) => o.domain),
    signerPublicKey,
  };
}
