/**
 * StrengthReceiptBadge / StrengthReceiptPanel — the on-screen, user-verifiable
 * face of a sealed domain-strength receipt. Until now a receipt was only
 * verified silently on the PDF export path; these views surface the SAME
 * tamper-evidence check on screen.
 *
 * Receipts are minted with the REAL `@almamesh/browser` signer + REAL
 * `@edgeproc/avow` keys — never a hand-rolled fake signature — so the badge runs
 * the exact fail-closed verification a real visitor's device runs. The covenant
 * check is load-bearing: the panel must render the calibrated BAND/tier and
 * never a fabricated percentage.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateSeedHex, publicKeyHex } from '@edgeproc/avow';
import { signDomainStrength } from '@almamesh/browser';
import type { DomainStrengthReceipt, StrengthSummary } from '@almamesh/browser/types';
import { useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { StrengthReceiptBadge, StrengthReceiptPanel } from '../StrengthReceiptBadge';

function summary(overrides: Partial<StrengthSummary> = {}): StrengthSummary {
  return {
    key_graha: 'saturn',
    key_graha_rupas: 7.5,
    key_graha_meets_minimum: true,
    sav_bindus: 31,
    band: 'moderate',
    shadbala_pct: 60,
    sav_pct: 55.357142857142854,
    strength_pct: 55.357142857142854,
    strength_tier: 'model',
    approximated: true,
    note: 'test fixture',
    ...overrides,
  } as StrengthSummary;
}

async function realReceipt(
  domain = 'career',
  overrides: Partial<StrengthSummary> = {},
): Promise<{ receipt: DomainStrengthReceipt; key: string }> {
  const seed = generateSeedHex();
  const key = await publicKeyHex(seed);
  const receipt = await signDomainStrength(domain, summary(overrides), seed);
  return { receipt, key };
}

describe('StrengthReceiptBadge', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders VERIFIED for a genuine receipt checked against its true signer', async () => {
    const { receipt, key } = await realReceipt();

    render(<StrengthReceiptBadge receipt={receipt} expectedPublicKey={key} />);

    const pill = await screen.findByText('Verified');
    // Accessible without color: a live status region carrying icon + word.
    const region = pill.closest('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('data-status')).toBe('verified');
  });

  it('renders NOT-VERIFIED (untrusted signer) when the pinned key did not seal it', async () => {
    const { receipt } = await realReceipt();
    const otherKey = await publicKeyHex(generateSeedHex());

    render(<StrengthReceiptBadge receipt={receipt} expectedPublicKey={otherKey} />);

    const pill = await screen.findByText(/untrusted signer/i);
    expect(pill.closest('[role="status"]')?.getAttribute('data-status')).toBe('wrong-key');
  });

  it('renders NOT-VERIFIED (tampered) when the headline % was mutated after sealing', async () => {
    const { receipt, key } = await realReceipt();
    const tampered: DomainStrengthReceipt = {
      ...receipt,
      payload: { ...receipt.payload, summary: { ...receipt.payload.summary, strength_pct: 999 } },
    };

    render(<StrengthReceiptBadge receipt={tampered} expectedPublicKey={key} />);

    const pill = await screen.findByText(/tampered or invalid/i);
    expect(pill.closest('[role="status"]')?.getAttribute('data-status')).toBe('invalid');
  });
});

describe('StrengthReceiptPanel — covenant: band/tier, never a fabricated %', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('surfaces the calibrated band + tier and never a raw strength percentage', async () => {
    const { receipt, key } = await realReceipt('career', { band: 'strong', strength_pct: 82.5 });

    render(<StrengthReceiptPanel receipt={receipt} expectedPublicKey={key} />);

    await screen.findByText('Verified');
    const panel = screen.getByTestId('domain-receipt-panel-career');
    // The calibrated band is shown (localized label), verbatim from summary.band.
    expect(panel.textContent).toContain('Strong');
    // The no-fake-precision covenant: no engine percentage is surfaced here.
    expect(panel.textContent).not.toContain('82.5');
    expect(panel.textContent).not.toMatch(/\d+(\.\d+)?\s*%/);
  });
});
