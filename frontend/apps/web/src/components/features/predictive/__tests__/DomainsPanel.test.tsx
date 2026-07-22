import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { generateSeedHex, publicKeyHex } from '@edgeproc/avow';
import { signDomainStrength } from '@almamesh/browser';
import type { StrengthSummary } from '@almamesh/browser/types';
import { useLanguageStore } from '@almamesh/store';

import '../../../../i18n/config';
import { DomainsPanel, DOMAIN_ORDER } from '../DomainsPanel';
import { DOMAINS_CTX } from '../../../../test/predictiveFixtures';

function receiptSummary(overrides: Partial<StrengthSummary> = {}): StrengthSummary {
  return {
    key_graha: 'saturn',
    key_graha_rupas: 7.5,
    key_graha_meets_minimum: true,
    sav_bindus: 31,
    band: 'moderate',
    shadbala_pct: 60,
    sav_pct: 55,
    strength_pct: 55,
    strength_tier: 'model',
    approximated: true,
    note: 'fixture',
    ...overrides,
  } as StrengthSummary;
}

describe('DomainsPanel', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'en' });
  });

  it('renders one card per life domain (all seven)', () => {
    render(<DomainsPanel domainsCtx={DOMAINS_CTX} />);
    expect(DOMAIN_ORDER).toHaveLength(7);
    for (const domain of DOMAIN_ORDER) {
      expect(screen.getByTestId(`domain-card-${domain}`)).toBeTruthy();
    }
  });

  it('shows the engine strength band and key-graha line per domain', () => {
    render(<DomainsPanel domainsCtx={DOMAINS_CTX} />);
    const career = screen.getByTestId('domain-card-career');
    expect(within(career).getByTestId('band-strong').textContent).toBe('Strong');
    // Formatted to two decimals — never the engine's raw 6.128260954302394.
    expect(within(career).getByText(/6\.13 rūpas/)).toBeTruthy();
    expect(career.textContent).not.toContain('6.128260954302394');
    // The health fixture is the weak band — rendered honestly, not hidden.
    const health = screen.getByTestId('domain-card-health');
    expect(within(health).getByTestId('band-weak').textContent).toBe('Weak');
  });

  it('shows the current emphasis: dasha activation, Sade Sati and transit tone', () => {
    render(<DomainsPanel domainsCtx={DOMAINS_CTX} />);
    const career = screen.getByTestId('domain-emphasis-career');
    expect(career.textContent).toContain('maha · antar');
    expect(career.textContent).toContain('Saturn');
    expect(career.textContent).toContain('Under Sade Sati');
    // The emphasis heuristic is flagged approximate — visible, not hidden.
    expect(career.textContent).toContain('≈');
    // A domain NOT activated by the dasha says so plainly.
    const family = screen.getByTestId('domain-emphasis-family');
    expect(family.textContent).toContain('Not emphasized by the running daśā');
  });

  it('lists upcoming timed windows with locale dates and sources', () => {
    render(<DomainsPanel domainsCtx={DOMAINS_CTX} />);
    const windows = screen.getByTestId('domain-windows-career');
    expect(windows.textContent).toContain('Jupiter enters Cancer');
    expect(windows.textContent).toContain('2026');
    expect(windows.textContent).not.toContain('2026-10-26'); // human date, not raw ISO
    expect(windows.textContent).toContain('(transit)');
    expect(windows.textContent).toContain('(daśā)');
  });

  it('reveals the house/karaka/varga working behind a disclosure', () => {
    render(<DomainsPanel domainsCtx={DOMAINS_CTX} />);
    const career = screen.getByTestId('domain-card-career');
    const toggle = within(career).getByRole('button', { expanded: false });
    fireEvent.click(toggle);
    expect(within(career).getByText(/House 10/)).toBeTruthy();
    expect(within(career).getByText(/Kārakas/)).toBeTruthy();
  });

  it('renders no receipt badge when no receipts/signer are provided (unchanged)', () => {
    render(<DomainsPanel domainsCtx={DOMAINS_CTX} />);
    for (const domain of DOMAIN_ORDER) {
      expect(screen.queryByTestId(`domain-receipt-${domain}`)).toBeNull();
    }
  });

  it('surfaces a per-domain VERIFIED receipt badge only for domains that have a receipt', async () => {
    const seed = generateSeedHex();
    const key = await publicKeyHex(seed);
    const receipts = {
      career: await signDomainStrength('career', receiptSummary(), seed),
      health: await signDomainStrength('health', receiptSummary({ band: 'weak' }), seed),
    };

    render(<DomainsPanel domainsCtx={DOMAINS_CTX} receipts={receipts} signerPublicKey={key} />);

    // A domain WITH a receipt shows a per-domain badge that verifies on screen —
    // fail-closed, icon+text (not colour alone) via the shared receipt view.
    for (const domain of ['career', 'health']) {
      const badge = await screen.findByTestId(`domain-receipt-${domain}`);
      expect(await within(badge).findByText('Verified')).toBeTruthy();
      expect(within(badge).getByRole('status').getAttribute('data-status')).toBe('verified');
    }
    // Domains WITHOUT a receipt render exactly as before — no badge.
    expect(screen.queryByTestId('domain-receipt-family')).toBeNull();
    expect(screen.queryByTestId('domain-receipt-finances')).toBeNull();
  });
});
